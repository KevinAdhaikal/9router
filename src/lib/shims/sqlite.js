export class DatabaseSync {
  constructor() {
    throw new Error("node:sqlite is not supported in Cloudflare Workers/Pages environment");
  }
}

export class StatementSync {}

export default {
  DatabaseSync,
  StatementSync,
};
