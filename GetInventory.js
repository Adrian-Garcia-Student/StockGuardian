const AWS = require('aws-sdk');
const zlib = require('zlib');
const s3 = new AWS.S3();

async function getUserInventories(ID_Creador, ID_Inventario) {
  const fecha = new Date().toISOString().split("T")[0];
  const bucket = 'db-bucket-backup-14251';
  const prefix = 'exportaciones/2025-04-23/Inventario/AWSDynamoDB/01745366415493-f6801c89/data/';

  if (prefix == null){
    
  }

  const list = await s3.listObjectsV2({ Bucket: bucket, Prefix: prefix }).promise();

  const results = [];

  for (const obj of list.Contents.filter(f => f.Key.endsWith('.json.gz'))) {
    const s3Object = await s3.getObject({ Bucket: bucket, Key: obj.Key }).promise();
    const decompressed = zlib.gunzipSync(s3Object.Body);
    const records = JSON.parse(decompressed.toString());

    for (const record of records) {
      const item = AWS.DynamoDB.Converter.unmarshall(record.Item);
      if (item.ID_Creador === ID_Creador && item.ID_Inventario == ID_Inventario) {
        results.push(item);
      }
    }
  }

  return results;
}
