import test from "node:test";
import assert from "node:assert/strict";
import { splitStatements } from "./sqlStatements";

test("splitStatements separates basic SQL statements", () => {
  const sql = `
    CREATE TABLE test (id INTEGER);
    INSERT INTO test(id) VALUES (1);
  `;

  assert.deepEqual(splitStatements(sql), [
    "CREATE TABLE test (id INTEGER)",
    "INSERT INTO test(id) VALUES (1)",
  ]);
});

test("splitStatements ignores semicolons inside strings", () => {
  const sql = `
    INSERT INTO notes(body) VALUES ('a;b;c');
    INSERT INTO notes(body) VALUES ("x;y;z");
  `;

  assert.deepEqual(splitStatements(sql), [
    "INSERT INTO notes(body) VALUES ('a;b;c')",
    'INSERT INTO notes(body) VALUES ("x;y;z")',
  ]);
});

test("splitStatements ignores semicolons inside comments", () => {
  const sql = `
    -- create table;
    CREATE TABLE test (id INTEGER);
    /* insert; still comment; */
    INSERT INTO test(id) VALUES (1);
  `;

  assert.deepEqual(splitStatements(sql), [
    "-- create table;\n    CREATE TABLE test (id INTEGER)",
    "/* insert; still comment; */\n    INSERT INTO test(id) VALUES (1)",
  ]);
});
