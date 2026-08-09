import os
import re
import json
import xml.etree.ElementTree as ET
from datetime import datetime
from decimal import Decimal
from flask import Blueprint, request, jsonify, render_template

try:
    from .focus_service import FocusNFeClient, build_nfe_devolucao_payload
    from .db_service import init_devolucao_tables
except ImportError:
    from focus_service import FocusNFeClient, build_nfe_devolucao_payload
    from db_service import init_devolucao_tables


devolucao_bp = Blueprint(
    'devolucao',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/devolucao-produtos/static'
)

def _get_db():
    from app import get_db
    conn = get_db()
    _ensure_tables_exist(conn)
    return conn

def _ensure_tables_exist(conn):
    try:
        init_devolucao_tables(conn)
    except Exception as _e:
        pass

def _serialize(obj):

    if isinstance(obj, (datetime, datetime.date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return obj

def _row_to_dict(row, cursor_description):
    if not row:
        return None
    colnames = [desc[0] for desc in cursor_description]
    return {k: _serialize(v) for k, v in zip(colnames, row)}

def _rows_to_dict_list(rows, cursor_description):
    if not rows:
        return []
    colnames = [desc[0] for desc in cursor_description]
    return [{k: _serialize(v) for k, v in zip(colnames, r)} for r in rows]


def _parse_nfe_xml_content(xml_text):
    """Extrai informações básicas de um XML de NF-e original."""
    try:
        # Remover namespaces para facilitar busca
        xml_clean = re.sub(r'xmlns="[^"]+"', '', xml_text)
        xml_clean = re.sub(r'xmlns:[a-zA-Z0-9]+="[^"]+"', '', xml_clean)
        root = ET.fromstring(xml_clean)
        
        # Chave de acesso
        chave = ''
        inf_nfe = root.find('.//infNFe')
        if inf_nfe is not None:
            chave = inf_nfe.attrib.get('Id', '').replace('NFe', '')
        if not chave:
            ch_el = root.find('.//chNFe')
            if ch_el is not None and ch_el.text:
                chave = ch_el.text.strip()
                
        # Emitente
        emit_nome = root.findtext('.//emit/xNome', default='')
        emit_cnpj = root.findtext('.//emit/CNPJ', default='')
        emit_uf = root.findtext('.//emit/enderEmit/UF', default='')
        emit_ie = root.findtext('.//emit/IE', default='')
        
        # Ide
        n_nf = root.findtext('.//ide/nNF', default='')
        serie = root.findtext('.//ide/serie', default='')
        dh_emi = root.findtext('.//ide/dhEmi', default='') or root.findtext('.//ide/dEmi', default='')
        
        # Totais
        v_tot = root.findtext('.//total/ICMSTot/vNF', default='0')
        
        # Itens
        items = []
        for det in root.findall('.//det'):
            prod = det.find('prod')
            if prod is not None:
                items.append({
                    'numero_item': int(det.attrib.get('nItem', 1)),
                    'codigo_produto': prod.findtext('cProd', default=''),
                    'descricao': prod.findtext('xProd', default=''),
                    'ncm': prod.findtext('NCM', default=''),
                    'cfop': prod.findtext('CFOP', default='5202'),
                    'unidade': prod.findtext('uCom', default='UN'),
                    'quantidade_original': float(prod.findtext('qCom', default='1')),
                    'valor_unitario': float(prod.findtext('vUnCom', default='0')),
                    'valor_bruto': float(prod.findtext('vProd', default='0')),
                })

        return {
            'chave_acesso': chave,
            'numero': n_nf,
            'serie': serie,
            'data_emissao': dh_emi,
            'cnpj_emitente': emit_cnpj,
            'nome_emitente': emit_nome,
            'uf_emitente': emit_uf,
            'inscricao_estadual_emitente': emit_ie,
            'valor_total': float(v_tot),
            'items': items
        }
    except Exception as e:
        print(f"Erro ao parsear XML: {e}")
        return None


# ── ROTAS DA API ──

@devolucao_bp.route('/api/devolucao/listar', methods=['GET'])
def listar_devolucoes():
    conn = _get_db()
    cur = conn.cursor()
    try:
        status_filter = request.args.get('status', '').strip()
        busca = request.args.get('busca', '').strip()

        query = """
            SELECT n.*, COUNT(i.id) as total_itens 
            FROM devolucao_notas_fiscais n
            LEFT JOIN devolucao_notas_itens i ON n.id = i.devolucao_id
            WHERE 1=1
        """
        params = []

        if status_filter:
            query += " AND n.status = %s"
            params.append(status_filter)

        if busca:
            query += " AND (n.ref LIKE %s OR n.chave_nfe_original LIKE %s OR n.nome_fornecedor LIKE %s OR n.cnpj_fornecedor LIKE %s)"
            b_val = f"%{busca}%"
            params.extend([b_val, b_val, b_val, b_val])

        query += " GROUP BY n.id ORDER BY n.id DESC"

        cur.execute(query, params)
        rows = cur.fetchall()
        result = _rows_to_dict_list(rows, cur.description)
        return jsonify({'sucesso': True, 'devolucoes': result})
    except Exception as e:
        return jsonify({'erro': f"Erro ao listar devoluções: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@devolucao_bp.route('/api/devolucao/<int:devolucao_id>', methods=['GET'])
def obter_devolucao(devolucao_id):
    conn = _get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM devolucao_notas_fiscais WHERE id = %s", (devolucao_id,))
        nota_row = cur.fetchone()
        if not nota_row:
            return jsonify({'erro': 'Devolução não encontrada'}), 404
        
        nota = _row_to_dict(nota_row, cur.description)

        cur.execute("SELECT * FROM devolucao_notas_itens WHERE devolucao_id = %s ORDER BY numero_item ASC", (devolucao_id,))
        itens_rows = cur.fetchall()
        nota['items'] = _rows_to_dict_list(itens_rows, cur.description)

        return jsonify({'sucesso': True, 'devolucao': nota})
    except Exception as e:
        return jsonify({'erro': f"Erro ao obter devolução: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@devolucao_bp.route('/api/devolucao/consultar-original', methods=['POST'])
def consultar_original():
    data = request.get_json() or {}
    chave = data.get('chave', '').strip().replace(' ', '')
    
    if not chave or len(chave) != 44 or not chave.isdigit():
        return jsonify({'erro': 'Chave de acesso inválida. A chave deve conter 44 dígitos numéricos.'}), 400

    conn = _get_db()
    cur = conn.cursor()
    try:
        # 1. Tentar localizar no cache local (devolucao_notas_originais)
        cur.execute("SELECT * FROM devolucao_notas_originais WHERE chave_acesso = %s", (chave,))
        original_row = cur.fetchone()
        if original_row:
            cached = _row_to_dict(original_row, cur.description)
            dados = json.loads(cached['dados_json']) if cached.get('dados_json') else cached
            return jsonify({'sucesso': True, 'origem': 'local', 'dados': dados})

        # 2. Se não estiver local, chamar API da Focus NFe (Consultar NF-e Recebida)
        client = FocusNFeClient()
        res = client.consultar_nfe_recebida(chave)
        
        if res.get('http_status') in (200, 201) and res.get('data'):
            dados_focus = res['data']
            
            # Salvar no cache local
            dados_json_str = json.dumps(dados_focus, ensure_ascii=False)
            cur.execute("""
                INSERT INTO devolucao_notas_originais 
                (chave_acesso, numero, serie, data_emissao, cnpj_emitente, nome_emitente, valor_total, dados_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE dados_json = VALUES(dados_json)
            """, (
                chave,
                dados_focus.get('numero'),
                dados_focus.get('serie'),
                dados_focus.get('data_emissao'),
                dados_focus.get('cnpj_emitente'),
                dados_focus.get('nome_emitente'),
                float(dados_focus.get('valor_total', 0)),
                dados_json_str
            ))
            conn.commit()
            return jsonify({'sucesso': True, 'origem': 'focus_nfe', 'dados': dados_focus})
        else:
            err_msg = res.get('error') or 'Não foi possível consultar a NF-e recebida via Focus NFe. Você também pode importar o arquivo XML da nota.'
            return jsonify({
                'sucesso': False, 
                'erro': err_msg,
                'permite_xml': True
            }), 400
    except Exception as e:
        return jsonify({'erro': f"Erro ao consultar NF-e original: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@devolucao_bp.route('/api/devolucao/importar-xml', methods=['POST'])
def importar_xml():
    xml_str = ''
    if 'xml_file' in request.files:
        file = request.files['xml_file']
        xml_str = file.read().decode('utf-8', errors='ignore')
    elif request.get_json() and request.get_json().get('xml'):
        xml_str = request.get_json().get('xml')
    else:
        return jsonify({'erro': 'Nenhum arquivo XML enviado.'}), 400

    parsed = _parse_nfe_xml_content(xml_str)
    if not parsed or not parsed.get('chave_acesso'):
        return jsonify({'erro': 'Arquivo XML inválido ou estrutura de NF-e não reconhecida.'}), 400

    conn = _get_db()
    cur = conn.cursor()
    try:
        dados_json_str = json.dumps(parsed, ensure_ascii=False)
        cur.execute("""
            INSERT INTO devolucao_notas_originais 
            (chave_acesso, numero, serie, data_emissao, cnpj_emitente, nome_emitente, uf_emitente, valor_total, dados_json)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE dados_json = VALUES(dados_json)
        """, (
            parsed['chave_acesso'],
            parsed['numero'],
            parsed['serie'],
            parsed['data_emissao'],
            parsed['cnpj_emitente'],
            parsed['nome_emitente'],
            parsed['uf_emitente'],
            parsed['valor_total'],
            dados_json_str
        ))
        conn.commit()
        
        # Enviar também para Focus NFe para registro se desejado
        client = FocusNFeClient()
        client.importar_nfe_xml(xml_str)

        return jsonify({'sucesso': True, 'dados': parsed})
    except Exception as e:
        return jsonify({'erro': f"Erro ao importar XML: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@devolucao_bp.route('/api/devolucao/salvar-rascunho', methods=['POST'])
def salvar_rascunho():
    data = request.get_json() or {}
    devolucao_id = data.get('id')
    chave_original = data.get('chave_nfe_original', '').strip()
    
    if not chave_original or len(chave_original) != 44:
        return jsonify({'erro': 'Chave de acesso da NF-e original é obrigatória e deve ter 44 dígitos.'}), 400

    itens = data.get('items', [])
    if not itens:
        return jsonify({'erro': 'Informe ao menos 1 produto a ser devolvido.'}), 400

    conn = _get_db()
    cur = conn.cursor()
    try:
        # Calcular totais dos itens devolvidos
        valor_produtos = 0.0
        for item in itens:
            qtd = float(item.get('quantidade_devolvida', 0))
            v_unit = float(item.get('valor_unitario', 0))
            v_bruto = round(qtd * v_unit, 2)
            item['valor_bruto'] = v_bruto
            item['valor_total'] = v_bruto
            valor_produtos += v_bruto

        valor_frete = float(data.get('valor_frete', 0.0))
        valor_desconto = float(data.get('valor_desconto', 0.0))
        valor_outras_despesas = float(data.get('valor_outras_despesas', 0.0))
        valor_total = round(valor_produtos + valor_frete + valor_outras_despesas - valor_desconto, 2)

        if devolucao_id:
            # Atualizar rascunho existente
            cur.execute("""
                UPDATE devolucao_notas_fiscais SET
                    natureza_operacao = %s,
                    chave_nfe_original = %s,
                    numero_nfe_original = %s,
                    serie_nfe_original = %s,
                    cnpj_fornecedor = %s,
                    nome_fornecedor = %s,
                    valor_produtos = %s,
                    valor_frete = %s,
                    valor_desconto = %s,
                    valor_outras_despesas = %s,
                    valor_total = %s,
                    modalidade_frete = %s,
                    cfop_padrao = %s,
                    observacoes = %s,
                    payload_json = %s
                WHERE id = %s AND status IN ('RASCUNHO', 'REJEITADA', 'ERRO')
            """, (
                data.get('natureza_operacao', 'DEVOLUCAO DE MERCADORIA'),
                chave_original,
                data.get('numero_nfe_original'),
                data.get('serie_nfe_original'),
                data.get('cnpj_fornecedor'),
                data.get('nome_fornecedor'),
                valor_produtos,
                valor_frete,
                valor_desconto,
                valor_outras_despesas,
                valor_total,
                int(data.get('modalidade_frete', 9)),
                data.get('cfop_padrao', '5202'),
                data.get('observacoes', ''),
                json.dumps(data, ensure_ascii=False),
                devolucao_id
            ))
            # Deletar itens antigos
            cur.execute("DELETE FROM devolucao_notas_itens WHERE devolucao_id = %s", (devolucao_id,))
        else:
            # Gerar ref única DEV + timestamp + random
            ref = f"DEV{datetime.now().strftime('%Y%m%d%H%M%S')}"
            cur.execute("""
                INSERT INTO devolucao_notas_fiscais
                (ref, status, finalidade_emissao, natureza_operacao, chave_nfe_original, numero_nfe_original, serie_nfe_original,
                 cnpj_fornecedor, nome_fornecedor, valor_produtos, valor_frete, valor_desconto, valor_outras_despesas,
                 valor_total, modalidade_frete, cfop_padrao, observacoes, payload_json)
                VALUES (%s, 'RASCUNHO', 4, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                ref,
                data.get('natureza_operacao', 'DEVOLUCAO DE MERCADORIA'),
                chave_original,
                data.get('numero_nfe_original'),
                data.get('serie_nfe_original'),
                data.get('cnpj_fornecedor'),
                data.get('nome_fornecedor'),
                valor_produtos,
                valor_frete,
                valor_desconto,
                valor_outras_despesas,
                valor_total,
                int(data.get('modalidade_frete', 9)),
                data.get('cfop_padrao', '5202'),
                data.get('observacoes', ''),
                json.dumps(data, ensure_ascii=False)
            ))
            devolucao_id = cur.lastrowid

        # Inserir novos itens
        for idx, item in enumerate(itens, start=1):
            cur.execute("""
                INSERT INTO devolucao_notas_itens
                (devolucao_id, numero_item, codigo_produto, descricao, ncm, cfop, unidade,
                 quantidade_original, quantidade_devolvida, valor_unitario, valor_bruto, valor_desconto, valor_total, icms_origem)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                devolucao_id,
                idx,
                item.get('codigo_produto', f"DEV{idx}"),
                item.get('descricao', 'PRODUTO DEVOLVIDO'),
                item.get('ncm', '').replace('.', ''),
                item.get('cfop', data.get('cfop_padrao', '5202')),
                item.get('unidade', 'UN'),
                float(item.get('quantidade_original', 1)),
                float(item.get('quantidade_devolvida', 1)),
                float(item.get('valor_unitario', 0)),
                float(item.get('valor_bruto', 0)),
                float(item.get('valor_desconto', 0)),
                float(item.get('valor_total', 0)),
                int(item.get('icms_origem', 0))
            ))

        conn.commit()
        return jsonify({'sucesso': True, 'id': devolucao_id, 'mensagem': 'Rascunho salvo com sucesso!'})
    except Exception as e:
        conn.rollback()
        return jsonify({'erro': f"Erro ao salvar rascunho: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@devolucao_bp.route('/api/devolucao/<int:devolucao_id>/emitir', methods=['POST'])
def emitir_devolucao(devolucao_id):
    conn = _get_db()
    cur = conn.cursor()
    try:
        # Lock da linha para evitar envio duplo simultâneo
        cur.execute("SELECT * FROM devolucao_notas_fiscais WHERE id = %s FOR UPDATE", (devolucao_id,))
        nota_row = cur.fetchone()
        if not nota_row:
            return jsonify({'erro': 'Devolução não encontrada.'}), 404

        nota = _row_to_dict(nota_row, cur.description)
        if nota['status'] == 'AUTORIZADA':
            return jsonify({'erro': 'Esta NF-e já foi AUTORIZADA.'}), 400
        if nota['status'] in ('ENVIANDO', 'PROCESSANDO'):
            return jsonify({'erro': 'Esta NF-e já está em processo de emissão.'}), 400

        # Buscar itens da devolução
        cur.execute("SELECT * FROM devolucao_notas_itens WHERE devolucao_id = %s ORDER BY numero_item ASC", (devolucao_id,))
        itens_rows = cur.fetchall()
        itens = _rows_to_dict_list(itens_rows, cur.description)
        
        if not itens:
            return jsonify({'erro': 'Devolução sem itens cadastrados.'}), 400

        # Montar estrutura completa para o payload Focus NFe
        dados_emissao = {
            "natureza_operacao": nota['natureza_operacao'],
            "tipo_documento": 1,
            "local_destino": 1,
            "consumidor_final": 0,
            "presenca_comprador": 0,
            "modalidade_frete": nota['modalidade_frete'],
            "chave_nfe_original": nota['chave_nfe_original'],
            "valor_produtos": nota['valor_produtos'],
            "valor_frete": nota['valor_frete'],
            "valor_desconto": nota['valor_desconto'],
            "valor_outras_despesas": nota['valor_outras_despesas'],
            "valor_total": nota['valor_total'],
            "observacoes": nota['observacoes'],
            "destinatario": {
                "nome": nota['nome_fornecedor'],
                "cnpj": nota['cnpj_fornecedor'],
                "indicador_inscricao_estadual": 1
            },
            "items": itens
        }

        # Atualizar status para ENVIANDO
        cur.execute("UPDATE devolucao_notas_fiscais SET status = 'ENVIANDO' WHERE id = %s", (devolucao_id,))
        conn.commit()

        # Montar payload e chamar Focus NFe API
        payload_focus = build_nfe_devolucao_payload(dados_emissao)
        client = FocusNFeClient()
        res = client.emitir_nfe(nota['ref'], payload_focus)

        http_status = res.get('http_status')
        res_data = res.get('data') or {}
        res_json_str = json.dumps(res, ensure_ascii=False)

        if http_status == 201:
            # Autorizada síncrona
            cur.execute("""
                UPDATE devolucao_notas_fiscais SET
                    status = 'AUTORIZADA',
                    chave_acesso = %s,
                    numero = %s,
                    serie = %s,
                    protocolo = %s,
                    xml_url = %s,
                    danfe_url = %s,
                    response_json = %s,
                    autorizado_em = NOW()
                WHERE id = %s
            """, (
                res_data.get('chave_nfe') or res_data.get('chave'),
                res_data.get('numero'),
                res_data.get('serie'),
                res_data.get('protocolo'),
                res_data.get('caminho_xml_nota_fiscal'),
                res_data.get('caminho_danfe'),
                res_json_str,
                devolucao_id
            ))
            conn.commit()
            return jsonify({'sucesso': True, 'status': 'AUTORIZADA', 'dados': res_data})

        elif http_status == 202:
            # Processando
            cur.execute("""
                UPDATE devolucao_notas_fiscais SET
                    status = 'PROCESSANDO',
                    response_json = %s
                WHERE id = %s
            """, (res_json_str, devolucao_id))
            conn.commit()
            return jsonify({'sucesso': True, 'status': 'PROCESSANDO', 'mensagem': 'NF-e enviada e em processamento na SEFAZ.'})

        else:
            # Rejeitada ou Erro
            msg_erro = res.get('error') or res_data.get('mensagem') or res_data.get('erro') or 'Erro desconhecido ao emitir NF-e'
            cod_erro = res_data.get('codigo') or str(http_status)
            cur.execute("""
                UPDATE devolucao_notas_fiscais SET
                    status = 'REJEITADA',
                    codigo_erro = %s,
                    mensagem_erro = %s,
                    response_json = %s
                WHERE id = %s
            """, (str(cod_erro), str(msg_erro), res_json_str, devolucao_id))
            conn.commit()
            return jsonify({
                'sucesso': False, 
                'status': 'REJEITADA', 
                'erro': msg_erro, 
                'codigo': cod_erro,
                'detalhes': res_data
            }), 400

    except Exception as e:
        conn.rollback()
        return jsonify({'erro': f"Erro no processo de emissão: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@devolucao_bp.route('/api/devolucao/<int:devolucao_id>/status', methods=['GET'])
def consultar_status_devolucao(devolucao_id):
    conn = _get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM devolucao_notas_fiscais WHERE id = %s", (devolucao_id,))
        nota_row = cur.fetchone()
        if not nota_row:
            return jsonify({'erro': 'Devolução não encontrada.'}), 404

        nota = _row_to_dict(nota_row, cur.description)
        client = FocusNFeClient()
        res = client.consultar_nfe(nota['ref'])

        if res.get('http_status') == 200 and res.get('data'):
            dados = res['data']
            status_focus = dados.get('status')
            res_json_str = json.dumps(dados, ensure_ascii=False)

            if status_focus in ('autorizado', 'autorizada'):
                cur.execute("""
                    UPDATE devolucao_notas_fiscais SET
                        status = 'AUTORIZADA',
                        chave_acesso = %s,
                        numero = %s,
                        serie = %s,
                        protocolo = %s,
                        xml_url = %s,
                        danfe_url = %s,
                        response_json = %s,
                        autorizado_em = NOW()
                    WHERE id = %s
                """, (
                    dados.get('chave_nfe') or dados.get('chave'),
                    dados.get('numero'),
                    dados.get('serie'),
                    dados.get('protocolo'),
                    dados.get('caminho_xml_nota_fiscal'),
                    dados.get('caminho_danfe'),
                    res_json_str,
                    devolucao_id
                ))
            elif status_focus in ('erro_autorizacao', 'rejeitado', 'rejeitada'):
                cur.execute("""
                    UPDATE devolucao_notas_fiscais SET
                        status = 'REJEITADA',
                        codigo_erro = %s,
                        mensagem_erro = %s,
                        response_json = %s
                    WHERE id = %s
                """, (
                    dados.get('codigo'),
                    dados.get('mensagem_sefaz') or dados.get('mensagem'),
                    res_json_str,
                    devolucao_id
                ))
            elif status_focus in ('cancelado', 'cancelada'):
                cur.execute("UPDATE devolucao_notas_fiscais SET status = 'CANCELADA', cancelado_em = NOW() WHERE id = %s", (devolucao_id,))

            conn.commit()
            return jsonify({'sucesso': True, 'status': status_focus, 'dados': dados})
        else:
            return jsonify({'erro': res.get('error') or 'Não foi possível obter o status da nota.'}), 400

    except Exception as e:
        return jsonify({'erro': f"Erro ao consultar status: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@devolucao_bp.route('/api/devolucao/<int:devolucao_id>/cancelar', methods=['POST'])
def cancelar_devolucao(devolucao_id):
    data = request.get_json() or {}
    justificativa = data.get('justificativa', '').strip()
    
    if not justificativa or len(justificativa) < 15 or len(justificativa) > 255:
        return jsonify({'erro': 'A justificativa do cancelamento deve conter entre 15 e 255 caracteres.'}), 400

    conn = _get_db()
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM devolucao_notas_fiscais WHERE id = %s", (devolucao_id,))
        nota_row = cur.fetchone()
        if not nota_row:
            return jsonify({'erro': 'Devolução não encontrada.'}), 404

        nota = _row_to_dict(nota_row, cur.description)
        if nota['status'] != 'AUTORIZADA':
            return jsonify({'erro': 'Apenas notas com status AUTORIZADA podem ser canceladas.'}), 400

        client = FocusNFeClient()
        res = client.cancelar_nfe(nota['ref'], justificativa)

        if res.get('http_status') in (200, 201) and (res.get('data', {}).get('status') in ('cancelado', 'cancelada') or res.get('data', {}).get('status_sefaz') == '101'):
            cur.execute("""
                UPDATE devolucao_notas_fiscais SET
                    status = 'CANCELADA',
                    cancelado_em = NOW(),
                    response_json = %s
                WHERE id = %s
            """, (json.dumps(res['data'], ensure_ascii=False), devolucao_id))
            conn.commit()
            return jsonify({'sucesso': True, 'mensagem': 'NF-e de devolução cancelada com sucesso.'})
        else:
            err = res.get('error') or res.get('data', {}).get('mensagem') or 'Erro ao cancelar NF-e.'
            return jsonify({'erro': err}), 400

    except Exception as e:
        return jsonify({'erro': f"Erro ao solicitar cancelamento: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()


@devolucao_bp.route('/api/webhooks/focusnfe', methods=['POST'])
def webhook_focusnfe():
    """Endpoint público para receber notificações assíncronas da Focus NFe."""
    payload = request.get_json(force=True, silent=True) or {}
    
    conn = _get_db()
    cur = conn.cursor()
    try:
        ref = payload.get('ref') or payload.get('referencia')
        event_id = payload.get('id') or payload.get('event_id')
        status_web = payload.get('status')
        
        # Registrar webhook recebido de forma idempotente
        cur.execute("""
            INSERT IGNORE INTO devolucao_webhook_events
            (event_id, reference, payload_json, status)
            VALUES (%s, %s, %s, %s)
        """, (
            str(event_id) if event_id else None,
            str(ref) if ref else None,
            json.dumps(payload, ensure_ascii=False),
            str(status_web) if status_web else None
        ))
        conn.commit()

        if ref:
            if status_web in ('autorizado', 'autorizada'):
                cur.execute("""
                    UPDATE devolucao_notas_fiscais SET
                        status = 'AUTORIZADA',
                        chave_acesso = %s,
                        numero = %s,
                        serie = %s,
                        protocolo = %s,
                        xml_url = %s,
                        danfe_url = %s,
                        autorizado_em = NOW()
                    WHERE ref = %s
                """, (
                    payload.get('chave_nfe') or payload.get('chave'),
                    payload.get('numero'),
                    payload.get('serie'),
                    payload.get('protocolo'),
                    payload.get('caminho_xml_nota_fiscal'),
                    payload.get('caminho_danfe'),
                    ref
                ))
            elif status_web in ('erro_autorizacao', 'rejeitado', 'rejeitada'):
                cur.execute("""
                    UPDATE devolucao_notas_fiscais SET
                        status = 'REJEITADA',
                        codigo_erro = %s,
                        mensagem_erro = %s
                    WHERE ref = %s
                """, (
                    payload.get('codigo'),
                    payload.get('mensagem_sefaz') or payload.get('mensagem'),
                    ref
                ))
            elif status_web in ('cancelado', 'cancelada'):
                cur.execute("UPDATE devolucao_notas_fiscais SET status = 'CANCELADA', cancelado_em = NOW() WHERE ref = %s", (ref,))

            conn.commit()

        return jsonify({'sucesso': True}), 200
    except Exception as e:
        print(f"Erro no webhook Focus NFe: {e}")
        return jsonify({'erro': str(e)}), 500
    finally:
        cur.close()
        conn.close()
