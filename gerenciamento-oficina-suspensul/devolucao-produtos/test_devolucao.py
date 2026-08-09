import os
import sys
import unittest

# Incluir o diretório atual no path
sys.path.insert(0, os.path.dirname(__file__))

from focus_service import FocusNFeClient, build_nfe_devolucao_payload
from routes import _parse_nfe_xml_content

class TestDevolucaoFocusNFe(unittest.TestCase):

    def test_focus_nfe_client_init(self):
        client = FocusNFeClient(token="TEST_TOKEN_123", env="homologacao")
        self.assertEqual(client.token, "TEST_TOKEN_123")
        self.assertEqual(client.base_url, "https://homologacao.focusnfe.com.br")
        
        headers = client._get_headers()
        self.assertIn("Authorization", headers)
        self.assertTrue(headers["Authorization"].startswith("Basic "))

    def test_focus_nfe_client_prod_url(self):
        client = FocusNFeClient(token="TEST_TOKEN_123", env="producao")
        self.assertEqual(client.base_url, "https://api.focusnfe.com.br")

    def test_build_nfe_devolucao_payload(self):
        dados = {
            "natureza_operacao": "DEVOLUCAO DE MERCADORIA",
            "chave_nfe_original": "35260811111111111111550010000000011000000010",
            "tipo_documento": 1,
            "local_destino": 1,
            "modalidade_frete": 9,
            "valor_produtos": 150.0,
            "valor_total": 150.0,
            "destinatario": {
                "nome": "AUTOPECAS EXEMPLO LTDA",
                "cnpj": "11.111.111/0001-11",
                "indicador_inscricao_estadual": 1
            },
            "items": [
                {
                    "codigo_produto": "PASTILHA123",
                    "descricao": "PASTILHA DE FREIO DIANTEIRA",
                    "ncm": "8708.30.90",
                    "cfop": "5202",
                    "quantidade_devolvida": 2,
                    "valor_unitario": 75.0,
                    "valor_bruto": 150.0
                }
            ]
        }

        payload = build_nfe_devolucao_payload(dados)

        self.assertEqual(payload["finalidade_emissao"], 4)
        self.assertEqual(payload["natureza_operacao"], "DEVOLUCAO DE MERCADORIA")
        self.assertEqual(len(payload["notas_referenciadas"]), 1)
        self.assertEqual(payload["notas_referenciadas"][0]["chave_nfe"], "35260811111111111111550010000000011000000010")
        self.assertEqual(payload["cnpj_destinatario"], "11111111000111")
        self.assertEqual(len(payload["items"]), 1)
        self.assertEqual(payload["items"][0]["codigo_ncm"], "87083090")
        self.assertEqual(payload["items"][0]["cfop"], "5202")
        self.assertEqual(payload["items"][0]["quantidade_comercial"], 2.0)
        self.assertEqual(payload["items"][0]["valor_unitario_comercial"], 75.0)

    def test_parse_nfe_xml_content(self):
        sample_xml = """<?xml version="1.0" encoding="UTF-8"?>
        <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
            <NFe>
                <infNFe Id="NFe35260811111111111111550010000000011000000010">
                    <ide>
                        <nNF>12345</nNF>
                        <serie>1</serie>
                        <dhEmi>2026-08-09T10:00:00-03:00</dhEmi>
                    </ide>
                    <emit>
                        <CNPJ>11111111000111</CNPJ>
                        <xNome>AUTOPECAS MODELO S.A.</xNome>
                        <enderEmit><UF>SC</UF></enderEmit>
                    </emit>
                    <total>
                        <ICMSTot><vNF>300.00</vNF></ICMSTot>
                    </total>
                    <det nItem="1">
                        <prod>
                            <cProd>AMORT01</cProd>
                            <xProd>AMORTECEDOR DIANTEIRO</xProd>
                            <NCM>87088000</NCM>
                            <CFOP>5102</CFOP>
                            <uCom>UN</uCom>
                            <qCom>2</qCom>
                            <vUnCom>150.00</vUnCom>
                            <vProd>300.00</vProd>
                        </prod>
                    </det>
                </infNFe>
            </NFe>
        </nfeProc>
        """

        parsed = _parse_nfe_xml_content(sample_xml)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["chave_acesso"], "35260811111111111111550010000000011000000010")
        self.assertEqual(parsed["numero"], "12345")
        self.assertEqual(parsed["nome_emitente"], "AUTOPECAS MODELO S.A.")
        self.assertEqual(len(parsed["items"]), 1)
        self.assertEqual(parsed["items"][0]["codigo_produto"], "AMORT01")

if __name__ == '__main__':
    unittest.main()
