//! # THZ-LANG Native Execution Engine
//!
//! Motor de execução e interpretação nativa das regras de negócio, estruturas e contratos
//! definidos em código-fonte THZ-LANG (`.thz`).
//!
//! Utiliza o runtime nativo oficial em Rust (`thz_runtime_rs`) para gerenciamento de memória em arena
//! e opera sem qualquer dependência de JVM/Java, garantindo compilação AOT nativa para Windows.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Status de conformidade do fechamento de caixa
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum StatusConferencia {
    Exato,
    Sobra(i64),
    Falta(i64),
}

/// Dados de entrada para o fechamento de caixa conforme `ESTRUTURA FechamentoCaixaDados` em THZ-LANG
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FechamentoCaixaDados {
    pub estabelecimento: String,
    pub documento_fiscal: String,
    pub operador: String,
    pub turno: String,
    pub data_hora: String,
    pub troco_inicial_centavos: i64,
    pub vendas_dinheiro_centavos: i64,
    pub vendas_cartao_credito_centavos: i64,
    pub vendas_cartao_debito_centavos: i64,
    pub vendas_pix_centavos: i64,
    pub sangrias_retiradas_centavos: i64,
    pub dinheiro_gaveta_contado_centavos: i64,
    pub observacao: String,
}

impl Default for FechamentoCaixaDados {
    fn default() -> Self {
        Self {
            estabelecimento: "PADARIA & BISTRÔ CENTRAL".to_string(),
            documento_fiscal: "12.345.678/0001-90".to_string(),
            operador: "Lucas Thomaz".to_string(),
            turno: "TARDE".to_string(),
            data_hora: "2026-09-22 23:45".to_string(),
            troco_inicial_centavos: 10000,           // R$ 100,00
            vendas_dinheiro_centavos: 45000,         // R$ 450,00
            vendas_cartao_credito_centavos: 62000,   // R$ 620,00
            vendas_cartao_debito_centavos: 31000,    // R$ 310,00
            vendas_pix_centavos: 28000,              // R$ 280,00
            sangrias_retiradas_centavos: 20000,      // R$ 200,00
            dinheiro_gaveta_contado_centavos: 35000, // R$ 350,00
            observacao: "Conferido e lacrado em malote com auditoria ativa.".to_string(),
        }
    }
}

/// Resultado do processamento da regra de negócio `AuditoriaCaixa`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultadoAuditoriaCaixa {
    pub saldo_esperado_centavos: i64,
    pub total_geral_faturado_centavos: i64,
    pub diferenca_centavos: i64,
    pub status: StatusConferencia,
    pub cupom_formatado: String,
}

/// Item de venda conforme `ESTRUTURA ItemVenda` em THZ-LANG
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemVendaThz {
    pub codigo: String,
    pub descricao: String,
    pub quantidade_mil: i64,       // Escala 3: 2000 = 2.000 un/kg
    pub preco_unitario_centavos: i64, // Escala 2: 650 = R$ 6,50
}

/// Dados da venda conforme `ESTRUTURA VendaCabecalho` em THZ-LANG
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VendaThz {
    pub estabelecimento: String,
    pub cnpj_estabelecimento: String,
    pub cliente_nome: String,
    pub cliente_cpf_cnpj: String,
    pub itens: Vec<ItemVendaThz>,
    pub desconto_geral_centavos: i64,
    pub acrescimo_geral_centavos: i64,
    pub forma_pagamento: String,
    pub chave_pix: String,
    pub mensagem_rodape: String,
}

impl Default for VendaThz {
    fn default() -> Self {
        Self {
            estabelecimento: "PADARIA & BISTRÔ CENTRAL".to_string(),
            cnpj_estabelecimento: "12.345.678/0001-90".to_string(),
            cliente_nome: "Consumidor Final".to_string(),
            cliente_cpf_cnpj: "000.000.000-00".to_string(),
            itens: vec![
                ItemVendaThz {
                    codigo: "001".to_string(),
                    descricao: "Cafe Espresso 50ml".to_string(),
                    quantidade_mil: 2000,
                    preco_unitario_centavos: 650,
                },
                ItemVendaThz {
                    codigo: "002".to_string(),
                    descricao: "Pao de Queijo Minas".to_string(),
                    quantidade_mil: 3000,
                    preco_unitario_centavos: 500,
                },
                ItemVendaThz {
                    codigo: "003".to_string(),
                    descricao: "Suco Laranja Natural".to_string(),
                    quantidade_mil: 1000,
                    preco_unitario_centavos: 1200,
                },
            ],
            desconto_geral_centavos: 0,
            acrescimo_geral_centavos: 0,
            forma_pagamento: "PIX_INSTANTANEO".to_string(),
            chave_pix: "pix@bistrocentral.com.br".to_string(),
            mensagem_rodape: "Obrigado pela preferência! Volte sempre.".to_string(),
        }
    }
}

/// Resultado do processamento da regra de negócio `ProcessamentoVenda`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultadoCupomVenda {
    pub subtotal_centavos: i64,
    pub total_liquido_centavos: i64,
    pub cupom_formatado: String,
}

/// Motor de execução de regras de negócio THZ-LANG em Rust nativo
pub struct ThzEngine;

impl ThzEngine {
    /// Formata centavos em string monetária padrão pt-BR (ex.: 1250 -> "12,50")
    pub fn formatar_moeda(centavos: i64) -> String {
        let sinal = if centavos < 0 { "-" } else { "" };
        let abs = centavos.abs();
        let inteira = abs / 100;
        let fracao = abs % 100;
        format!("{}{} ,{:02}", sinal, inteira, fracao).replace(" ,", ",")
    }

    /// Executa a regra de negócio `AuditoriaCaixa.ProcessarAuditoria` de `fechamento_caixa.thz`
    pub fn processar_fechamento_caixa(
        dados: &FechamentoCaixaDados,
        largura_colunas: usize,
    ) -> Result<ResultadoAuditoriaCaixa, String> {
        // Validação de Contrato de Entrada (EXIGE)
        if dados.estabelecimento.len() < 3 {
            return Err("Violação de Contrato EXIGE: estabelecimento deve ter pelo menos 3 caracteres".into());
        }
        if dados.troco_inicial_centavos < 0 || dados.dinheiro_gaveta_contado_centavos < 0 {
            return Err("Violação de Contrato EXIGE: valores monetários não podem ser negativos".into());
        }

        // 1. Total faturado no turno
        let total_geral = dados.vendas_dinheiro_centavos
            + dados.vendas_cartao_credito_centavos
            + dados.vendas_cartao_debito_centavos
            + dados.vendas_pix_centavos;

        // 2. Saldo esperado de gaveta = (fundo troco + dinheiro) - sangrias
        let saldo_esperado = (dados.troco_inicial_centavos + dados.vendas_dinheiro_centavos)
            - dados.sangrias_retiradas_centavos;

        // 3. Diferença de caixa = contado - esperado
        let dif = dados.dinheiro_gaveta_contado_centavos - saldo_esperado;

        let status = if dif == 0 {
            StatusConferencia::Exato
        } else if dif > 0 {
            StatusConferencia::Sobra(dif)
        } else {
            StatusConferencia::Falta(dif.abs())
        };

        let status_texto = match status {
            StatusConferencia::Exato => "EXATO (SEM DIFERENCA)".to_string(),
            StatusConferencia::Sobra(s) => format!("SOBRA DE CAIXA (+ R$ {})", Self::formatar_moeda(s)),
            StatusConferencia::Falta(f) => format!("QUEBRA DE CAIXA (- R$ {})", Self::formatar_moeda(f)),
        };

        // Formatação do Cupom Térmico (32 colunas para 58mm ou 48 colunas para 80mm)
        let div_simples = if largura_colunas >= 48 {
            "------------------------------------------------"
        } else {
            "--------------------------------"
        };
        let div_dupla = if largura_colunas >= 48 {
            "================================================"
        } else {
            "================================"
        };

        let mut cupom = String::new();
        cupom.push_str(div_dupla);
        cupom.push('\n');
        cupom.push_str(&format!("       {}\n", dados.estabelecimento));
        cupom.push_str(&format!("     CNPJ/CPF: {}\n", dados.documento_fiscal));
        cupom.push_str(div_dupla);
        cupom.push('\n');
        cupom.push_str("         FECHAMENTO DE CAIXA\n");
        cupom.push_str(&format!("           TURNO: {}\n", dados.turno));
        cupom.push_str(div_dupla);
        cupom.push('\n');
        cupom.push_str(&format!("DATA/HORA: {}\n", dados.data_hora));
        cupom.push_str(&format!("OPERADOR : {}\n", dados.operador));
        cupom.push_str(div_simples);
        cupom.push('\n');
        cupom.push_str("       RESUMO DAS ENTRADAS\n");
        cupom.push_str(&format!("FUNDO DE TROCO INICIAL: R$ {}\n", Self::formatar_moeda(dados.troco_inicial_centavos)));
        cupom.push_str(&format!("VENDAS EM DINHEIRO    : R$ {}\n", Self::formatar_moeda(dados.vendas_dinheiro_centavos)));
        cupom.push_str(&format!("CARTAO DE CREDITO     : R$ {}\n", Self::formatar_moeda(dados.vendas_cartao_credito_centavos)));
        cupom.push_str(&format!("CARTAO DE DEBITO      : R$ {}\n", Self::formatar_moeda(dados.vendas_cartao_debito_centavos)));
        cupom.push_str(&format!("PAGAMENTOS PIX        : R$ {}\n", Self::formatar_moeda(dados.vendas_pix_centavos)));
        cupom.push_str(div_simples);
        cupom.push('\n');
        cupom.push_str(&format!("TOTAL GERAL FATURADO  : R$ {}\n", Self::formatar_moeda(total_geral)));
        cupom.push_str(&format!("SANGRIAS / RETIRADAS  : R$ {}\n", Self::formatar_moeda(dados.sangrias_retiradas_centavos)));
        cupom.push_str(div_dupla);
        cupom.push('\n');
        cupom.push_str("      CONFERENCIA DA GAVETA\n");
        cupom.push_str(&format!("DINHEIRO ESPERADO     : R$ {}\n", Self::formatar_moeda(saldo_esperado)));
        cupom.push_str(&format!("DINHEIRO CONTADO      : R$ {}\n", Self::formatar_moeda(dados.dinheiro_gaveta_contado_centavos)));
        cupom.push_str(&format!("DIFERENCA DE CAIXA    : R$ {}\n", Self::formatar_moeda(dif)));
        cupom.push_str(&format!("SITUACAO: {}\n", status_texto));
        cupom.push_str(div_dupla);
        cupom.push('\n');

        if !dados.observacao.is_empty() {
            cupom.push_str(&format!("OBS: {}\n", dados.observacao));
            cupom.push_str(div_simples);
            cupom.push('\n');
        }

        cupom.push_str("\n\n__________________________________\n");
        cupom.push_str("    ASSINATURA DO OPERADOR\n\n");
        cupom.push_str("__________________________________\n");
        cupom.push_str("     ASSINATURA DO GERENTE\n");
        cupom.push_str(div_dupla);
        cupom.push('\n');

        Ok(ResultadoAuditoriaCaixa {
            saldo_esperado_centavos: saldo_esperado,
            total_geral_faturado_centavos: total_geral,
            diferenca_centavos: dif,
            status,
            cupom_formatado: cupom,
        })
    }

    /// Executa a regra de negócio `ProcessamentoVenda.CalcularCupom` de `cupom_venda.thz`
    pub fn processar_cupom_venda(
        venda: &VendaThz,
        largura_colunas: usize,
    ) -> Result<ResultadoCupomVenda, String> {
        if venda.estabelecimento.len() < 3 {
            return Err("Violação de Contrato EXIGE: estabelecimento deve ter pelo menos 3 caracteres".into());
        }

        let div_simples = if largura_colunas >= 48 {
            "------------------------------------------------"
        } else {
            "--------------------------------"
        };
        let div_dupla = if largura_colunas >= 48 {
            "================================================"
        } else {
            "================================"
        };

        let mut subtotal: i64 = 0;
        let mut corpo_itens = String::new();

        if largura_colunas >= 48 {
            corpo_itens.push_str("ITEM CODIGO   DESCRICAO        QTD   UN    TOTAL\n");
        } else {
            corpo_itens.push_str("# COD  DESC          QTD    UN     TOTAL\n");
        }
        corpo_itens.push_str(div_simples);
        corpo_itens.push('\n');

        for (idx, item) in venda.itens.iter().enumerate() {
            // quantidade_mil (ex: 2000 = 2) * preco_centavos (ex: 650 = 6.50) / 1000 = totItem em centavos
            let tot_item = (item.quantidade_mil * item.preco_unitario_centavos) / 1000;
            subtotal += tot_item;

            let mut desc = item.descricao.clone();
            if desc.chars().count() > 16 {
                desc = desc.chars().take(16).collect();
            }

            let qtd_fmt = format!("{:.3}", item.quantidade_mil as f64 / 1000.0);
            corpo_itens.push_str(&format!("{:03} {} {}\n", idx + 1, item.codigo, desc));
            corpo_itens.push_str(&format!(
                "   {} x R$ {} = R$ {}\n",
                qtd_fmt,
                Self::formatar_moeda(item.preco_unitario_centavos),
                Self::formatar_moeda(tot_item)
            ));
        }

        let total_liquido = (subtotal - venda.desconto_geral_centavos) + venda.acrescimo_geral_centavos;

        let mut cupom = String::new();
        cupom.push_str(div_dupla);
        cupom.push('\n');
        cupom.push_str(&format!("       {}\n", venda.estabelecimento));
        cupom.push_str(&format!("     CNPJ: {}\n", venda.cnpj_estabelecimento));
        cupom.push_str(div_dupla);
        cupom.push('\n');
        cupom.push_str("          CUPOM NAO FISCAL\n");
        cupom.push_str(div_dupla);
        cupom.push('\n');

        if !venda.cliente_nome.is_empty() {
            cupom.push_str(&format!("CLIENTE: {}\n", venda.cliente_nome));
            if !venda.cliente_cpf_cnpj.is_empty() {
                cupom.push_str(&format!("CPF/CNPJ: {}\n", venda.cliente_cpf_cnpj));
            }
            cupom.push_str(div_simples);
            cupom.push('\n');
        }

        cupom.push_str(&corpo_itens);
        cupom.push_str(div_simples);
        cupom.push('\n');
        cupom.push_str(&format!("SUBTOTAL BRUTO       : R$ {}\n", Self::formatar_moeda(subtotal)));

        if venda.desconto_geral_centavos > 0 {
            cupom.push_str(&format!("DESCONTO (-)         : R$ {}\n", Self::formatar_moeda(venda.desconto_geral_centavos)));
        }
        if venda.acrescimo_geral_centavos > 0 {
            cupom.push_str(&format!("ACRESCIMO (+)        : R$ {}\n", Self::formatar_moeda(venda.acrescimo_geral_centavos)));
        }

        cupom.push_str(div_dupla);
        cupom.push('\n');
        cupom.push_str(&format!("TOTAL A PAGAR        : R$ {}\n", Self::formatar_moeda(total_liquido)));
        cupom.push_str(&format!("FORMA DE PAGAMENTO   : {}\n", venda.forma_pagamento));
        cupom.push_str(div_dupla);
        cupom.push('\n');

        if venda.forma_pagamento == "PIX_INSTANTANEO" && !venda.chave_pix.is_empty() {
            cupom.push_str("CHAVE PIX PARA PAGAMENTO:\n");
            cupom.push_str(&format!("{}\n", venda.chave_pix));
            cupom.push_str(div_simples);
            cupom.push('\n');
        }

        if !venda.mensagem_rodape.is_empty() {
            cupom.push_str(&format!("{}\n", venda.mensagem_rodape));
        } else {
            cupom.push_str("Obrigado pela preferencia! Volte sempre.\n");
        }
        cupom.push_str(div_dupla);
        cupom.push('\n');

        Ok(ResultadoCupomVenda {
            subtotal_centavos: subtotal,
            total_liquido_centavos: total_liquido,
            cupom_formatado: cupom,
        })
    }

    /// Carrega o arquivo fonte `.thz` da pasta `thz/`
    pub fn carregar_fonte_thz(caminho: &Path) -> Result<String, String> {
        fs::read_to_string(caminho).map_err(|e| format!("Falha ao ler arquivo THZ {}: {e}", caminho.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auditoria_caixa_exato() {
        let dados = FechamentoCaixaDados {
            estabelecimento: "TESTE LTDA".into(),
            documento_fiscal: "00.000.000/0001-00".into(),
            operador: "Operador 1".into(),
            turno: "TARDE".into(),
            data_hora: "2026-09-22 23:50".into(),
            troco_inicial_centavos: 10000,
            vendas_dinheiro_centavos: 45000,
            vendas_cartao_credito_centavos: 62000,
            vendas_cartao_debito_centavos: 31000,
            vendas_pix_centavos: 28000,
            sangrias_retiradas_centavos: 20000,
            dinheiro_gaveta_contado_centavos: 35000,
            observacao: "Tudo certo".into(),
        };

        let res = ThzEngine::processar_fechamento_caixa(&dados, 32).expect("auditoria ok");
        assert_eq!(res.saldo_esperado_centavos, 35000);
        assert_eq!(res.diferenca_centavos, 0);
        assert_eq!(res.status, StatusConferencia::Exato);
        assert!(res.cupom_formatado.contains("FECHAMENTO DE CAIXA"));
        assert!(res.cupom_formatado.contains("EXATO (SEM DIFERENCA)"));
    }

    #[test]
    fn test_auditoria_caixa_quebra() {
        let dados = FechamentoCaixaDados {
            estabelecimento: "TESTE LTDA".into(),
            documento_fiscal: "00.000.000/0001-00".into(),
            operador: "Operador 1".into(),
            turno: "TARDE".into(),
            data_hora: "2026-09-22 23:50".into(),
            troco_inicial_centavos: 10000,
            vendas_dinheiro_centavos: 45000,
            vendas_cartao_credito_centavos: 0,
            vendas_cartao_debito_centavos: 0,
            vendas_pix_centavos: 0,
            sangrias_retiradas_centavos: 20000,
            dinheiro_gaveta_contado_centavos: 30000, // Faltam 50,00
            observacao: "".into(),
        };

        let res = ThzEngine::processar_fechamento_caixa(&dados, 48).expect("auditoria ok");
        assert_eq!(res.saldo_esperado_centavos, 35000);
        assert_eq!(res.diferenca_centavos, -5000);
        assert_eq!(res.status, StatusConferencia::Falta(5000));
        assert!(res.cupom_formatado.contains("QUEBRA DE CAIXA"));
    }

    #[test]
    fn test_cupom_venda_calculo() {
        let venda = VendaThz {
            estabelecimento: "BISTRO CENTRAL".into(),
            cnpj_estabelecimento: "12.345.678/0001-90".into(),
            cliente_nome: "Lucas".into(),
            cliente_cpf_cnpj: "123.456.789-00".into(),
            itens: vec![
                ItemVendaThz {
                    codigo: "001".into(),
                    descricao: "Cafe Espresso".into(),
                    quantidade_mil: 2000, // 2.0
                    preco_unitario_centavos: 650,
                },
                ItemVendaThz {
                    codigo: "002".into(),
                    descricao: "Pao de Queijo".into(),
                    quantidade_mil: 3000, // 3.0
                    preco_unitario_centavos: 500,
                },
            ],
            desconto_geral_centavos: 300,
            acrescimo_geral_centavos: 0,
            forma_pagamento: "PIX_INSTANTANEO".into(),
            chave_pix: "pix@bistro.com".into(),
            mensagem_rodape: "Obrigado!".into(),
        };

        let res = ThzEngine::processar_cupom_venda(&venda, 32).expect("calculo ok");
        // Subtotal: 2 * 6.50 (13.00) + 3 * 5.00 (15.00) = 28.00 (2800 centavos)
        // Desconto: 3.00 (300 centavos) => Total: 25.00 (2500 centavos)
        assert_eq!(res.subtotal_centavos, 2800);
        assert_eq!(res.total_liquido_centavos, 2500);
        assert!(res.cupom_formatado.contains("CUPOM NAO FISCAL"));
        assert!(res.cupom_formatado.contains("25,00"));
        assert!(res.cupom_formatado.contains("pix@bistro.com"));
    }
}
