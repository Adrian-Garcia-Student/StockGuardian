import express from "express";
import cors from "cors";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
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

    if (!resultado.Item || resultado.Item.Contrasena !== password) {
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
  const { email, password, comida } = req.body;

  const nuevoUsuario = {
    Nombre: email,
    ID_Usuario: generarID(),
    Contrasena: password,
    Comida: comida,
  };

  try {
    const comando = new PutCommand({
      TableName: "Usuarios",
      Item: nuevoUsuario,
      ConditionExpression: "attribute_not_exists(Nombre)", //Evitar sobreescribir
    });

    await ddbDocClient.send(comando);
    res.status(201).json({ mensaje: "Usuario registrado con éxito" });

  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      res.status(409).json({ mensaje: "El usuario ya existe." });
    } else {
      console.error("Error al registrar usuario:", error);
      res.status(500).json({ mensaje: "Error del servidor al registrar." });
    }
  }
});

app.post("/verificar-usuario", async (req, res) => {
  const { email } = req.body;

  try {
    const comando = new GetCommand({
      TableName: "Usuarios",
      Key: { Nombre: email }
    });

    const resultado = await ddbDocClient.send(comando);

    if (!resultado.Item) {
      return res.status(404).json({ mensaje: "Usuario no encontrado." });
    }

    res.status(200).json({ mensaje: "Usuario encontrado." });
  } catch (error) {
    console.error("Error al verificar usuario:", error);
    res.status(500).json({ mensaje: "Error del servidor al verificar usuario." });
  }
});

//Validar la comida favorita, que es pregunta de seguridad
app.post("/validar-comida", async (req, res) => {
  const { email, comida, nuevaContraseña } = req.body;

  try {
    const comandoGet = new GetCommand({
      TableName: "Usuarios",
      Key: { Nombre: email }
    });

    const resultado = await ddbDocClient.send(comandoGet);

    if (!resultado.Item) {
      return res.status(404).json({ mensaje: "Usuario no encontrado." });
    }

    if (resultado.Item.Comida !== comida) {
      return res.status(403).json({ mensaje: "Comida favorita incorrecta." });
    }

    const comandoUpdate = new UpdateCommand({
      TableName: "Usuarios",
      Key: { Nombre: email },
      UpdateExpression: "SET Contrasena = :nueva",
      ExpressionAttributeValues: {
        ":nueva": nuevaContraseña
      }
    });

    await ddbDocClient.send(comandoUpdate);

    res.status(200).json({ mensaje: "Contraseña actualizada correctamente." });

  } catch (error) {
    console.error("Error al validar comida o actualizar contraseña:", error);
    res.status(500).json({ mensaje: "Error en el servidor." });
  }
});


//Crear un inventario con sus datos generales
app.post("/datosinventario", async (req, res) => {
  const { nombre, descripcion, creadorID } = req.body;

  if (!nombre || !descripcion || !creadorID) {
    return res.status(400).json({ mensaje: "Faltan campos obligatorios." });
  }

  const nuevoInventario = {
    ID_Inventario: generarID(),
    ID_Creador: creadorID,
    Nombre: nombre,
    Descripción: descripcion,
  };

  try {
    const comando = new PutCommand({
      TableName: "DatosInventario",
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

//Obtener los inventarios del usuario actual
app.get("/datosinventario/:idCreador", async (req, res) => {
  const { idCreador } = req.params;

  try {
    const comando = new QueryCommand({
      TableName: "DatosInventario",
      IndexName: "InventariosPorCreador",
      KeyConditionExpression: "ID_Creador = :id",
      ExpressionAttributeValues: {
        ":id": idCreador,
      },
    });

    const resultado = await ddbDocClient.send(comando);

    res.json({ datosinventario: resultado.Items });
  } catch (error) {
    console.error("Error al obtener inventarios:", error);
    res.status(500).json({ mensaje: "Error del servidor." });
  }
});

//Validar el ID de un inventario para acceder
app.get('/verificarinventario/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const comando = new QueryCommand({
      TableName: 'DatosInventario',
      KeyConditionExpression: 'ID_Inventario = :id',
      ExpressionAttributeValues: {
        ':id': id
      }
    });

    const resultado = await ddbDocClient.send(comando);

    if (!resultado.Items || resultado.Items.length === 0) {
      return res.status(404).json({ error: "Inventario no encontrado" });
    }

    res.json(resultado.Items[0]); //Regresar sólo el primer resultado del query
  } catch (error) {
    console.error("Error al consultar el inventario:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

//Recupera el nombre y descripción del inventario actual
app.get("/recuperarinventario/:id", async (req, res) => {
  const { id } = req.params;

  try{
    const comando = new QueryCommand({
      TableName: 'DatosInventario',
      KeyConditionExpression: 'ID_Inventario = :id',
      ExpressionAttributeValues: {
        ':id': id
      },
      ProjectionExpression: "Nombre, #descripcion",
      ExpressionAttributeNames: {
        "#descripcion": "Descripción"
      }
    })

    const resultado = await ddbDocClient.send(comando);

    console.log("Resultado de la consulta:", resultado.Items);

    if (resultado.Items.length === 0) {
      return res.status(404).json({ mensaje: "Inventario no encontrado" });
    }

    const item = resultado.Items[0]; //Obtener primer item del query
    const nombre = item.Nombre/*?.S*/ || ""; //Guardar en primer variable el nombre, si no existe queda en blanco
    const descripcion = item.Descripción/*?.S*/ || ""; //Guardar en segunda variable la descripción, si no existe queda en blanco

    res.json({ nombre, descripcion }); //Responde con las dos variables en json

  } catch (error) {
    console.error("Error al consultar la información del inventario:", error);
    res.status(500).json({ error: "Error del servidor"});
  }
});

// Guardar (sobreescribir) los datos de un inventario
app.post("/api/inventario/actualizar", async (req, res) => {
  const { filas, inventarioId } = req.body;

  if (!filas || !Array.isArray(filas) || !inventarioId) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  try {
    // 1. Consultar los datos existentes
    const paramsConsulta = {
      TableName: "Inventarios",
      KeyConditionExpression: "ID_Inventario = :id",
      ExpressionAttributeValues: { ":id": inventarioId }
    };

    const datosAnteriores = await ddbDocClient.send(new QueryCommand(paramsConsulta));
    const eliminaciones = datosAnteriores.Items.map(item => ({
      DeleteRequest: {
        Key: {
          ID_Inventario: item.ID_Inventario,
          ID_Fila: item.ID_Fila
        }
      }
    }));

    // 2. Ejecutar eliminaciones en lotes separados (máx 25 por lote)
    const lotesEliminar = [];
    const copiaEliminaciones = [...eliminaciones];
    while (copiaEliminaciones.length > 0) {
      lotesEliminar.push(copiaEliminaciones.splice(0, 25));
    }

    for (const lote of lotesEliminar) {
      await ddbDocClient.send(new BatchWriteCommand({
        RequestItems: {
          Inventarios: lote
        }
      }));
    }

    // 3. Preparar las nuevas filas
    const nuevasFilas = filas.map((fila, i) => ({
      PutRequest: {
        Item: {
          ID_Inventario: inventarioId,
          ID_Fila: `FILA_${i + 1}`,
          datos: fila
        }
      }
    }));

    // 4. Ejecutar inserciones en lotes separados (máx 25 por lote)
    const lotesInsertar = [];
    const copiaNuevasFilas = [...nuevasFilas];
    while (copiaNuevasFilas.length > 0) {
      lotesInsertar.push(copiaNuevasFilas.splice(0, 25));
    }

    for (const lote of lotesInsertar) {
      await ddbDocClient.send(new BatchWriteCommand({
        RequestItems: {
          Inventarios: lote
        }
      }));
    }

    return res.json({ mensaje: "Inventario sobrescrito correctamente" });

  } catch (err) {
    console.error("Error al actualizar inventario:", err);
    return res.status(500).json({ error: "Error al actualizar" });
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
