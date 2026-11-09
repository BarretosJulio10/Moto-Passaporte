# PRD 2.3 — Moto Passaporte para todos os veículos

**Status: aprovado em 09/11/2026 — GUARDADO. Não implementar até pedido explícito do responsável.**

Documento completo (fonte oficial, 14 seções com RFs e critérios de aceite):
https://claude.ai/artifact/1dUEZhWe5rUP55Lba6JuEH

Cópia resumida também no Project "MOTO_ESTORICO": `claude/PRD_Moto_Passaporte_v2.3_Todos_os_Veiculos.md`.

## Decisões
- Marca "Moto Passaporte" e domínio atual ficam por enquanto.
- Fases: A carro (+ base genérica) → B caminhão → C moto aquática e embarcações.
- Oficina tem um segmento só: Moto, Carro, Pesados ou Náutica (marinas = Náutica). Oficinas atuais = Moto.
- Embarcação: número de inscrição do TIE como identificador; 0 a 4 motores, cada um com dados e horímetro próprios; motor trocado fica "retirado" com suas horas.
- km e horas nunca se misturam; caminhão pode ter horas opcionais de equipamento.
- Premium do dono igual para todos os tipos; oficina Náutica paga o mesmo valor; limite do gratuito soma veículos de todos os tipos.
- Metas 60 dias após Fase A: carros cadastrados e oficinas de carro com OS entregue; números definidos pelo responsável no lançamento.

## Modelo de dados (resumo)
- Tabelas atuais mantêm o nome; colunas novas com padrão moto/km: `vehicle_type`, `usage_unit`, `segment`, `identifier_kind`, `engine_id`.
- Novas tabelas: `vessel_engines`, `maintenance_record_engines`, `category_vehicle_types`, `nautical_brands`, `marine_engine_brands`.
- Segmento conferido no banco; testes também pelo caminho do site (pg_safeupdate, lição da 2.2-C).
