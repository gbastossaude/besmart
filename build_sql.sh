#!/bin/sh
# Junta os arquivos SQL em sql/atos_completo.sql (instalação nova OU atualização de banco existente)
cd "$(dirname "$0")"
{
  echo "-- ====================================================================="
  echo "--  ATOS SISTEMA — SQL COMPLETO"
  echo "--  Serve para instalar do zero E para atualizar um banco já instalado"
  echo "--  (pode ser executado novamente sem perder dados)."
  echo "--  Depois rode o 07_supabase_storage_cron.sql."
  echo "-- ====================================================================="
  for f in sql/0[1-6]_*.sql sql/08_*.sql; do [ -f "$f" ] && { echo; echo; cat "$f"; }; done
} > sql/atos_completo.sql
