import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import readline from "readline";

//cliente de DynamoDB
const client = new DynamoDBClient({ region: "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

async function validarUsuario(nombre, contrasena) {
  try {
    const comando = new GetCommand({
      TableName: "Usuarios",
      Key: {
        Nombre: nombre,
      },
    });

    const resultado = await ddbDocClient.send(comando);

    if (!resultado.Item) {
      console.log("Usuario no encontrado.");
      return;
    }

    if (resultado.Item.Contraseña === contrasena) {
      console.log(`Acceso concedido a ${resultado.Item.Nombre}!`);
    } else {
      console.log("Contraseña incorrecta.");
    }
  } catch (error) {
    console.error("Error al consultar la tabla de DynamoDB:", error);
  }
}

// Leer nombre y contraseña desde consola
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Nombre de usuario: ", (nombre) => {
  rl.question("Contraseña: ", (contrasena) => {
    validarUsuario(nombre, contrasena).then(() => rl.close());
  });
});
