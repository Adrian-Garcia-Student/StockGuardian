import { DynamoDBClient, ExportTableToPointInTimeCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });

const tablas = [
  {
    nombre: "Usuarios",
    arn: "arn:aws:dynamodb:us-east-1:106530302970:table/Usuarios"
  },
  {
    nombre: "Inventarios",
    arn: "arn:aws:dynamodb:us-east-1:106530302970:table/Inventarios"
  },
  {
    nombre: "Reporte_Usuarios",
    arn: "arn:aws:dynamodb:us-east-1:106530302970:table/Reporte_Usuarios"
  },
  {
    nombre: "Historial",
    arn: "arn:aws:dynamodb:us-east-1:106530302970:table/Historial"
  },
  {
    nombre: "DatosInventario",
    arn: "arn:aws:dynamodb:us-east-1:106530302970:table/DatosInventario"
  }
];

const bucket = "stock-guardian-db-backups"; //bucket
const fecha = new Date().toISOString().split("T")[0];

const run = async () => {
  for (const tabla of tablas) {
    try {
      const command = new ExportTableToPointInTimeCommand({
        TableArn: tabla.arn,
        S3Bucket: bucket,
        S3Prefix: `exportaciones/${fecha}/${tabla.nombre}/`, // Carpeta separada por tabla y fecha
        ExportFormat: "DYNAMODB_JSON"
      });

      const result = await client.send(command);
      console.log(`✅ Exportación iniciada para '${tabla.nombre}':`);
      console.log(result.ExportDescription.ExportArn);
    } catch (err) {
      console.error(`❌ Error al exportar '${tabla.nombre}':`, err);
    }
  }
};

run();
