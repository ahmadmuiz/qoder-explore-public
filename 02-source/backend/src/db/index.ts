import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config.js';

let db: DatabaseSync | null = null;

export function openDb(file = config.dbPath): DatabaseSync {
  mkdirSync(dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec('PRAGMA journal_mode = WAL');
  conn.exec('PRAGMA foreign_keys = ON');
  conn.exec('PRAGMA busy_timeout = 5000');
  return conn;
}

export function initDb(file = config.dbPath): DatabaseSync {
  if (db) return db;
  db = openDb(file);
  const schema = readFileSync(join(import.meta.dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

export function getDb(): DatabaseSync {
  if (!db) return initDb();
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function tx<T>(fn: () => T): T {
  const conn = getDb();
  conn.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    conn.exec('COMMIT');
    return result;
  } catch (error) {
    conn.exec('ROLLBACK');
    throw error;
  }
}

export type Row = Record<string, unknown>;

export function one<T = Row>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...(params as never[])) as T | undefined;
}

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...(params as never[])) as T[];
}

export function run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
  return getDb().prepare(sql).run(...(params as never[])) as { changes: number; lastInsertRowid: number | bigint };
}
