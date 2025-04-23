const AWS = require('aws-sdk');
const zlib = require('zlib');
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

async function getUserInventories(ID_Creador, ID_Inventario = null) {
  const fecha = new Date().toISOString().split("T")[0]; // Get today's date in YYYY-MM-DD format
  const bucket = 'db-bucket-backup-14251';
  const prefix = `exportaciones/${fecha}/Inventario/AWSDynamoDB/01745366415493-f6801c89/data/`;
  
  try {
    // Try to fetch the data from DynamoDB first
    const params = {
      TableName: 'Inventario', // Specify the correct table name
      KeyConditionExpression: 'ID_Creador = :creatorId',
      ExpressionAttributeValues: {
        ':creatorId': ID_Creador,
      },
    };

    // If ID_Inventario is provided, add that to the condition as well
    if (ID_Inventario) {
      params.KeyConditionExpression += ' AND ID_Inventario = :inventoryId';
      params.ExpressionAttributeValues[':inventoryId'] = ID_Inventario;
    }

    const dynamoResult = await dynamoDB.query(params).promise();

    if (dynamoResult.Items && dynamoResult.Items.length > 0) {
      return dynamoResult.Items; // Return the result from DynamoDB if found
    } else {
      throw new Error('No data found in DynamoDB'); // If no data found, fall back to S3
    }
  } catch (error) {
    console.log(`Error accessing DynamoDB: ${error.message}. Falling back to S3.`);

    // If there's an error, or no data, use S3 as the fallback
    const list = await s3.listObjectsV2({ Bucket: bucket, Prefix: prefix }).promise();
    const results = [];

    for (const obj of list.Contents.filter(f => f.Key.endsWith('.json.gz'))) {
      const s3Object = await s3.getObject({ Bucket: bucket, Key: obj.Key }).promise();
      const decompressed = zlib.gunzipSync(s3Object.Body);
      const records = JSON.parse(decompressed.toString());

      for (const record of records) {
        const item = AWS.DynamoDB.Converter.unmarshall(record.Item);
        
        const matchCreador = item.ID_Creador === ID_Creador;
        const matchInventario = ID_Inventario ? item.ID_Inventario === ID_Inventario : true;

        if (matchCreador && matchInventario) {
          results.push(item);
        }
      }
    }

    return results; // Return the result from S3 if DynamoDB fails
  }
}

