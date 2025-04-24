import express from "express";
import cors from "cors";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import bodyParser from "body-parser";
import path from "path";  // Importamos path
import { fileURLToPath } from "url";  // Para convertir la URL en ruta de archivo

const app = express();
const port = 3000;

// Obtener el directorio actual (equivalente a __dirname en módulos ES)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors()); // permite que frontend haga peticiones
app.use(bodyParser.json());

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, "public")));  // Esto permite acceder a archivos en la carpeta 'public'

// Configura el cliente de DynamoDB
const client = new DynamoDBClient({ region: "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const comando = new GetCommand({
      TableName: "Usuarios",
      Key: {
        Nombre: email,
      },
    });

    const resultado = await ddbDocClient.send(comando);

    if (!resultado.Item || resultado.Item.Contraseña !== password) {
      return res.status(401).json({ mensaje: "Usuario o contraseña incorrectos." });
    }

    res.json({ 
      mensaje: `Acceso concedido. ¡Bienvenido, ${resultado.Item.Nombre}!`,
      id: resultado.Item.ID_Usuario,
    });
  } catch (error) {
    console.error("Error al autenticar:", error);
    res.status(500).json({ mensaje: "Error del servidor." });
  }
});

app.post("/registro", async (req, res) => {
  const { email, password } = req.body;

  const nuevoUsuario = {
    Nombre: email,
    ID_Usuario: generarIDUsuario(),
    Contraseña: password,
  };

  try{
    const comando = new PutCommand({
      TableName: "Usuarios",
      Item: nuevoUsuario,
      ConditionExpression: "attribute_not_exists(Nombre)", //Evita sobreescribir
    });

    await ddbDocClient.send(comando);
    res.status(201).json({mensaje: "Usuario registrado con éxito"});

  } catch (error){
    //El error se genera en attribute_not_exists
    if (error.name === "ConditionalCheckFailedException") {
      res.status(409).json({ mensaje: "El usuario ya existe." });
    } else {
      //Es otro tipo de error en el sistema.
      console.error("Error al registrar usuario:", error);
      res.status(500).json({ mensaje: "Error del servidor al registrar." });
  }
}
});

//Generador de IDs de Usuario Aleatorios
function generarIDUsuario(longitud = 8) {
  const caracteres = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < longitud; i++) {
    id += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return id;
}


// Inicia el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
