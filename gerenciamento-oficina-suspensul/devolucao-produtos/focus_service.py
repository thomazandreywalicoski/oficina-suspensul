import os
import json
import base64
import urllib.request
import urllib.error
from datetime import datetime

class FocusNFeClient:
    def __init__(self, token=None, env=None):
        self.token = token or os.getenv('FOCUS_TOKEN') or os.getenv('FOCUS_NFE_API_KEY') or ''
        self.env = (env or os.getenv('FOCUS_ENV') or os.getenv('APP_ENV') or 'homologacao').lower().strip()
        
        if self.env in ('producao', 'production', 'prod'):
            self.base_url = 'https://api.focusnfe.com.br'
        else:
            self.base_url = 'https://homologacao.focusnfe.com.br'

    def _get_headers(self, content_type='application/json'):
        auth_bytes = f"{self.token}:".encode('utf-8')
        auth_b64 = base64.b64encode(auth_bytes).decode('utf-8')
        headers = {
            'Accept': 'application/json',
            'Authorization': f'Basic {auth_b64}'
        }
        if content_type:
            headers['Content-Type'] = content_type
        return headers

    def request(self, method, path, body=None, is_raw=False):
        if not self.token:
            return {
                'http_status': 401,
                'error': 'Token da Focus NFe não configurado nas variáveis de ambiente (FOCUS_TOKEN).'
            }

        url = f"{self.base_url}{path}"
        headers = self._get_headers(content_type='text/xml;charset=utf-8' if is_raw else 'application/json')
        
        data_bytes = None
        if body is not None:
            if isinstance(body, str):
                data_bytes = body.encode('utf-8')
            elif isinstance(body, bytes):
                data_bytes = body
            else:
                data_bytes = json.dumps(body, ensure_ascii=False).encode('utf-8')

        req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method.upper())

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                status = resp.status
                res_body = resp.read().decode('utf-8')
                try:
                    json_data = json.loads(res_body)
                except Exception:
                    json_data = {'raw': res_body}
                return {
                    'http_status': status,
                    'data': json_data,
                    'body': res_body
                }
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8') if e.fp else ''
            try:
                err_json = json.loads(err_body)
            except Exception:
                err_json = {'erro': err_body or str(e)}
            return {
                'http_status': e.code,
                'data': err_json,
                'body': err_body,
                'error': err_json.get('mensagem') or err_json.get('erro') or str(e)
            }
        except Exception as e:
            return {
                'http_status': 500,
                'error': f'Falha na comunicação com Focus NFe: {str(e)}'
            }

    def consultar_nfe_recebida(self, chave, cnpj=None):
        path = f"/v2/nfes_recebidas/{chave}?completa=1"
        if cnpj:
            path += f"&cnpj={cnpj}"
        return self.request('GET', path)

    def importar_nfe_xml(self, xml_content):
        return self.request('POST', '/v2/nfe/importacao', body=xml_content, is_raw=True)

    def emitir_nfe(self, ref, payload):
        return self.request('POST', f"/v2/nfe?ref={ref}", body=payload)

    def consultar_nfe(self, ref):
        return self.request('GET', f"/v2/nfe/{ref}?completa=1")

    def cancelar_nfe(self, ref, justificativa):
        body = {'justificativa': justificativa}
        return self.request('DELETE', f"/v2/nfe/{ref}", body=body)


def build_nfe_devolucao_payload(dados_devolucao):
    """
    Monta o payload JSON exigido pela Focus NFe v2 para finalidade de emissão = 4 (Devolução).
    """
    agora_iso = datetime.now().astimezone().isoformat()
    
    # Identificação da operação
    payload = {
        "natureza_operacao": dados_devolucao.get("natureza_operacao", "DEVOLUCAO DE MERCADORIA"),
        "data_emissao": agora_iso,
        "data_entrada_saida": agora_iso,
        "tipo_documento": int(dados_devolucao.get("tipo_documento", 1)),  # 1 = Saída
        "local_destino": int(dados_devolucao.get("local_destino", 1)),   # 1 = Operação interna
        "finalidade_emissao": 4,                                         # 4 = Devolução
        "consumidor_final": int(dados_devolucao.get("consumidor_final", 0)),
        "presenca_comprador": int(dados_devolucao.get("presenca_comprador", 0)),
        "modalidade_frete": int(dados_devolucao.get("modalidade_frete", 9)),
    }

    # Nota Referenciada
    chave_original = dados_devolucao.get("chave_nfe_original", "").strip()
    if chave_original:
        payload["notas_referenciadas"] = [
            {"chave_nfe": chave_original}
        ]

    # Destinatário (Autopeças)
    dest = dados_devolucao.get("destinatario", {})
    if dest:
        dest_payload = {}
        if dest.get("nome"): dest_payload["nome_destinatario"] = dest["nome"]
        if dest.get("cnpj"): dest_payload["cnpj_destinatario"] = dest["cnpj"].replace('.', '').replace('/', '').replace('-', '')
        if dest.get("cpf"): dest_payload["cpf_destinatario"] = dest["cpf"].replace('.', '').replace('-', '')
        if dest.get("inscricao_estadual"): dest_payload["inscricao_estadual_destinatario"] = dest["inscricao_estadual"]
        dest_payload["indicador_inscricao_estadual_destinatario"] = int(dest.get("indicador_inscricao_estadual", 1))
        
        if dest.get("logradouro"): dest_payload["logradouro_destinatario"] = dest["logradouro"]
        if dest.get("numero"): dest_payload["numero_destinatario"] = str(dest["numero"])
        if dest.get("bairro"): dest_payload["bairro_destinatario"] = dest["bairro"]
        if dest.get("municipio"): dest_payload["municipio_destinatario"] = dest["municipio"]
        if dest.get("uf"): dest_payload["uf_destinatario"] = dest["uf"]
        if dest.get("cep"): dest_payload["cep_destinatario"] = str(dest["cep"]).replace('-', '')
        if dest.get("pais"): dest_payload["pais_destinatario"] = dest.get("pais", "Brasil")
        
        payload.update(dest_payload)

    # Emitente (Se configurado explicitamente ou usa cadastro na Focus)
    emit = dados_devolucao.get("emitente", {})
    if emit:
        if emit.get("cnpj"): payload["cnpj_emitente"] = emit["cnpj"].replace('.', '').replace('/', '').replace('-', '')
        if emit.get("nome"): payload["nome_emitente"] = emit["nome"]
        if emit.get("uf"): payload["uf_emitente"] = emit["uf"]

    # Valores da Nota
    payload["valor_frete"] = float(dados_devolucao.get("valor_frete", 0.0))
    payload["valor_seguro"] = float(dados_devolucao.get("valor_seguro", 0.0))
    payload["valor_desconto"] = float(dados_devolucao.get("valor_desconto", 0.0))
    payload["valor_outras_despesas"] = float(dados_devolucao.get("valor_outras_despesas", 0.0))
    payload["valor_produtos"] = float(dados_devolucao.get("valor_produtos", 0.0))
    payload["valor_total"] = float(dados_devolucao.get("valor_total", 0.0))

    # Itens
    items_list = []
    for idx, item in enumerate(dados_devolucao.get("items", []), start=1):
        item_obj = {
            "numero_item": idx,
            "codigo_produto": item.get("codigo_produto", f"DEV{idx}"),
            "descricao": item.get("descricao", "PRODUTO DEVOLVIDO"),
            "codigo_ncm": item.get("ncm", "").replace('.', '').strip(),
            "cfop": item.get("cfop", "5202").strip(),
            "unidade_comercial": item.get("unidade", "UN"),
            "quantidade_comercial": float(item.get("quantidade_devolvida", 1)),
            "valor_unitario_comercial": float(item.get("valor_unitario", 0)),
            "valor_bruto": float(item.get("valor_bruto", 0)),
            "inclui_no_total": 1,
            "icms_origem": int(item.get("icms_origem", 0))
        }
        
        # Tributação adicional se houver
        if item.get("icms_situacao_tributaria"):
            item_obj["icms_situacao_tributaria"] = str(item["icms_situacao_tributaria"])
        
        items_list.append(item_obj)

    payload["items"] = items_list

    # Observações adicionais
    obs = dados_devolucao.get("observacoes", "")
    if obs:
        payload["informacoes_adicionais_contribuinte"] = obs
    elif chave_original:
        payload["informacoes_adicionais_contribuinte"] = f"DEVOLUCAO REFERENTE A NF-E CHAVE {chave_original}"

    return payload
