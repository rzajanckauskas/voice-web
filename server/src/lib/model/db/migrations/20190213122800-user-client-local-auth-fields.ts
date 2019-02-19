export const up = async function(db: any): Promise<any> {
  return db.runSql(
    `
      ALTER TABLE user_clients
        ADD COLUMN hash VARCHAR(255) DEFAULT NULL
    `
  );
};

export const down = function(): Promise<any> {
  return null;
};
