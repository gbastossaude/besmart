import { test } from "node:test";
import assert from "node:assert/strict";
import { carregar } from "./carregar.mjs";

const js = carregar(["core.js", "validacao.js"]);
const cpfValido = js("cpfValido"), cnpjValido = js("cnpjValido"), tipoDocValido = js("tipoDocValido");
const formatarDoc = js("formatarDoc"), formatarTelefone = js("formatarTelefone"), normDoc = js("normDoc");

test("CPF: aceita válidos e recusa dígito errado ou repetido", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("52998224725"), true);
  assert.equal(cpfValido("529.982.247-24"), false);
  assert.equal(cpfValido("111.111.111-11"), false);
  assert.equal(cpfValido("123"), false);
});

test("CNPJ numérico", () => {
  assert.equal(cnpjValido("11.222.333/0001-81"), true);
  assert.equal(cnpjValido("11.222.333/0001-80"), false);
  assert.equal(cnpjValido("00.000.000/0000-00"), false);
});

test("CNPJ alfanumérico (Receita Federal, julho/2026)", () => {
  // exemplo oficial da Receita: 12.ABC.345/01DE-35
  assert.equal(cnpjValido("12.ABC.345/01DE-35"), true);
  assert.equal(cnpjValido("12abc34501de35"), true);
  assert.equal(cnpjValido("12.ABC.345/01DE-36"), false);
  assert.equal(normDoc("12.abc.345/01de-35"), "12ABC34501DE35");
});

test("tipoDocValido: vazio é permitido, inválido é null", () => {
  assert.equal(tipoDocValido(""), "");
  assert.equal(tipoDocValido("529.982.247-25"), "cpf");
  assert.equal(tipoDocValido("11.222.333/0001-81"), "cnpj");
  assert.equal(tipoDocValido("12345"), null);
});

test("máscaras", () => {
  assert.equal(formatarDoc("52998224725"), "529.982.247-25");
  assert.equal(formatarDoc("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatarDoc("12abc34501de35"), "12.ABC.345/01DE-35");
  assert.equal(formatarDoc("5299"), "529.9");
  assert.equal(formatarTelefone("11987654321"), "(11) 98765-4321");
  assert.equal(formatarTelefone("1133334444"), "(11) 3333-4444");
  assert.equal(formatarTelefone("+55 11 98765-4321"), "(11) 98765-4321");
});
