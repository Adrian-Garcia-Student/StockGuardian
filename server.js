import express from "express";
import cors from "cors";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
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
    ID_Usuario: generarID(),
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

app.post("/inventario", async (req, res) => {
  const { nombre, descripcion, creadorID } = req.body;

  if (!nombre || !descripcion || !creadorID) {
    return res.status(400).json({ mensaje: "Faltan campos obligatorios." });
  }

  const nuevoInventario = {
    ID_Inventario: generarIDInventario(),
    ID_Creador: creadorID,
    Nombre: nombre,
    Descripción: descripcion,
    Productos: [], // inicializado vacío
  };

  try {
    const comando = new PutCommand({
      TableName: "Inventario",
      Item: nuevoInventario,
      ConditionExpression: "attribute_not_exists(ID_Inventario)", // evita sobrescribir
    });

    await ddbDocClient.send(comando);
    res.status(201).json({ mensaje: "Inventario creado con éxito", ID_Inventario: nuevoInventario.ID_Inventario });
  } catch (error) {
    console.error("Error al crear inventario:", error);
    res.status(500).json({ mensaje: "Error del servidor al crear inventario." });
  }
});

app.get("/inventario:id", async (req, res) => {
  const { id } = req.params;

  try {
    const comando = new GetCommand({
      TableName: "Inventario",
      Key: { ID_Inventario: id },
    });

    const resultado = await ddbDocClient.send(comando);

    if (!resultado.Item) {
      return res.status(404).json({ mensaje: "Inventario no encontrado." });
    }

    res.json(resultado.Item);
  } catch (error) {
    console.error("Error al obtener inventario:", error);
    res.status(500).json({ mensaje: "Error del servidor al obtener inventario." });
  }
});

//Generador de IDs de aleatorios
function generarID(longitud = 8) {
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
