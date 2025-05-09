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

//Obtener los inventarios del usuario actual (la ultima modificacion viene del historial)
app.get("/datosinventario/:idCreador", async (req, res) => {
  const { idCreador } = req.params;
  try {
    //Llamar a inventarios
    const invResp = await ddbDocClient.send(new QueryCommand({
      TableName: "DatosInventario",
      IndexName: "InventariosPorCreador",
      KeyConditionExpression: "ID_Creador = :c",
      ExpressionAttributeValues: { ":c": idCreador }
    }));
    const inventarios = invResp.Items || [];

    //Para cada inventario, buscar último historial
    const enriched = await Promise.all(inventarios.map(async inv => {
      // Query el historial más reciente
      const histResp = await ddbDocClient.send(new QueryCommand({
        TableName: "Historial",
        IndexName: "ByInventario",
        KeyConditionExpression: "ID_Inventario = :i",
        ExpressionAttributeValues: { ":i": inv.ID_Inventario },
        ScanIndexForward: false, // descendente por Fecha_Accion
        Limit: 1
      }));
      const last = histResp.Items && histResp.Items[0];
      return {
        ...inv,
        FechaModificacion: last ? last.Fecha_Accion : null
      };
    }));

    return res.json({ datosinventario: enriched });
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

//Cargar las filas y columnas del inventario
app.get("/api/inventario/obtener", async (req, res) => {
  const { inventarioId } = req.query;
  if (!inventarioId) return res.status(400).json({ error: "Falta el ID del inventario" });

  try {
    const resultado = await ddbDocClient.send(new QueryCommand({
      TableName: "Inventarios",
      KeyConditionExpression: "ID_Inventario = :id",
      ExpressionAttributeValues: { ":id": inventarioId }
    }));

    const columnasSet = new Set();
    const filasLimpias = resultado.Items.map(item => {
      Object.keys(item.datos).forEach(col => columnasSet.add(col));
      return {
        ID_Fila: item.ID_Fila,
        datos: item.datos   // <-- directamente
      };
    });

    const columnas = Array.from(columnasSet);
    return res.json({ columnas, filas: filasLimpias });
  } catch (err) {
    console.error("Error al consultar inventario:", err);
    return res.status(500).json({ error: "Error al consultar inventario" });
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

// Borrar un inventario. Se borrarán sus datos básicos y filas
app.delete("/api/inventario/eliminar", async (req, res) => {
  const { inventarioId } = req.query;
  if (!inventarioId) {
    return res.status(400).json({ error: "inventarioId es requerido" });
  }

  try {
    // 1) Borrar el registro principal de DatosInventario
    await ddbDocClient.send(new DeleteCommand({
      TableName: "DatosInventario",
      Key: { 
        ID_Inventario: inventarioId
      }
    }));

    // 2) Consultar todas las filas en la tabla Inventarios
    const queryResp = await ddbDocClient.send(new QueryCommand({
      TableName: "Inventarios",
      KeyConditionExpression: "ID_Inventario = :id",
      ExpressionAttributeValues: {
        ":id": inventarioId
      }
    }));

    const items = queryResp.Items || [];

    // 3) Preparar DeleteRequests para cada fila
    const deleteRequests = items.map(item => ({
      DeleteRequest: {
        Key: {
          ID_Inventario: item.ID_Inventario,
          ID_Fila: item.ID_Fila
        }
      }
    }));

    // 4) Enviar en lotes de 25
    for (let i = 0; i < deleteRequests.length; i += 25) {
      const lote = deleteRequests.slice(i, i + 25);
      await ddbDocClient.send(new BatchWriteCommand({
        RequestItems: { Inventarios: lote }
      }));
    }

    return res.json({ mensaje: "Inventario eliminado correctamente" });
  } catch (err) {
    console.error("Error al eliminar inventario:", err);
    return res.status(500).json({ error: "Error al eliminar inventario" });
  }
});

//Guardar un cambio en el la DB de historial
app.post("/api/historial", async (req, res) => {
  const {
    columna_afectada,
    fecha_accion,
    id_inventario,
    id_usuario,
    tipo_accion
  } = req.body;

  if (!fecha_accion || !id_inventario || !tipo_accion) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }

  try {
    // Generamos un ID único para este historial
    const idHistorial =generarID();

    await ddbDocClient.send(new PutCommand({
      TableName: "Historial",
      Item: {
        ID_Historial:     idHistorial,
        ID_Inventario:    id_inventario,
        Fecha_Accion:     fecha_accion,
        Columna_Afectada: columna_afectada || null,
        ID_Usuario:       id_usuario      || null,
        Tipo_Accion:      tipo_accion
      }
    }));

    return res.json({ mensaje: "Cambio registrado", ID_Historial: idHistorial });
  } catch (err) {
    console.error("Error al guardar historial:", err);
    return res.status(500).json({ error: "Error al guardar historial" });
  }
});

//Recuperar todos los cambios de un historial según el inventario
app.get("/api/historial/obtener", async (req, res) => {
  const { inventarioId } = req.query;
  if (!inventarioId) {
    return res.status(400).json({ error: "inventarioId es requerido" });
  }

  try {
    const resultado = await ddbDocClient.send(new QueryCommand({
      TableName: "Historial",
      IndexName: "ByInventario", 
      KeyConditionExpression: "ID_Inventario = :inv",
      ExpressionAttributeValues: { ":inv": inventarioId },
      ScanIndexForward: false
    }));

    // Devolver el array de items tal cual
    return res.json({ historial: resultado.Items || [] });
  } catch (err) {
    console.error("Error al obtener historial:", err);
    return res.status(500).json({ error: "Error al consultar historial" });
  }
});


//Generador de IDs aleatorios
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
