const express = require('express');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const uuid = require('uuid');
const moment = require('moment');

const app = express();
const port = 3000;

// Configuración de la conexión a la base de datos MySQL
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'wilaper2025',
  password: 'Wil--254@@@****',
  database: 'servycominternet',
});

connection.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err);
    return;
  }
  console.log('Conexión a la base de datos MySQL exitosa');
});

// Middleware para verificar la validez del token JWT
function autenticacion(req, res, next) {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: 'Token de autorización no proporcionado' });
  }

  jwt.verify(token, 'secreto', (err, decodedToken) => {
    if (err) {
      return res.status(403).json({ error: 'Token de autorización inválido - Vuelva a Iniciar Sesion' });
    }
    // Extraer el ID del usuario del token
    const usuarioId = decodedToken.id_usuario;
    if (!usuarioId) {
      return res.status(403).json({ error: 'ID de usuario no encontrado en el token' });
    }

    // Consultar la base de datos para obtener el nombre de usuario
    connection.query('SELECT nombre FROM usuario WHERE id_usuario = ?', [usuarioId], (err, rows) => {
      if (err || rows.length === 0) {
        return res.status(403).json({ error: 'Nombre de usuario no encontrado' });
      }

      // Agregar el nombre de usuario al objeto req.user
      req.user = {
        id_usuario: usuarioId,
        rol: decodedToken.rol,
        nombre: rows[0].nombre
      };
      next();
    });
  });
}

// Configuración para analizar datos JSON en las solicitudes
app.use(express.json());

// Ruta para la autenticación del login (clientes y administradores)
app.post('/login', (req, res) => {
  const { nombre, clave, rol } = req.body;
  let query, userType;

  if (rol === 'cliente') {
    query = 'SELECT *, CONCAT(nombre, " ", completoNyA) AS nombreCompleto FROM usuario WHERE nombre = ? AND clave = ? AND rol = ?';
    userType = 'cliente';
  } else if (rol === 'administrador') {
    query = 'SELECT *, CONCAT(nombre, " ", completoNyA) AS nombreCompleto FROM usuario WHERE nombre = ? AND clave = ? AND rol = ?';
    userType = 'administrador';
  } else {
    res.status(400).json({ error: 'Rol de usuario no válido' });
    return;
  }

  connection.query(query, [nombre, clave, rol], (err, rows) => {
    if (err) {
      console.error('Error al realizar la autenticación del login:', err);
      res.status(500).json({ error: 'Error al realizar la autenticación del login' });
      return;
    }
    if (rows.length === 0) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }
    // Usuario autenticado, generar token JWT
    const token = jwt.sign({ id_usuario: rows[0].id_usuario, rol: userType }, 'secreto', { expiresIn: '1h' });
    res.status(200).json({ message: 'Inicio de sesión exitoso', token: token, nombreCompleto: rows[0].nombreCompleto });
  });
});



// Ruta para crear un nuevo ticket (cliente)
app.post('/ticket', autenticacion, (req, res) => {
  const { asunto, descripcion } = req.body;

  // Determinar la prioridad basada en el asunto
  let prioridad_id;
  switch (asunto) {
    case 'Fibra Partida':
    case 'Internet no Funciona':
      prioridad_id = 1; // Alta prioridad
      break;
    case 'Internet Lento':
      prioridad_id = 2; // Media prioridad
      break;
    case 'Cambio de Contraseña':
    case 'Configuracion Equipos Adicionales':
      prioridad_id = 3; // Baja prioridad
      break;
    default:
      prioridad_id = 1; // Prioridad por defecto (baja)
  }

  // Generar un UUID único para la serie del ticket
  const serie = 'ser' + Math.floor(Math.random() * 10000);

  // Obtener el ID del usuario autenticado
  const clienteId = req.user.id_usuario;

  // Obtener el nombre de usuario del objeto req.user
  const nombreUsuario = req.user.nombre;

  const fechaFormateada = new Date().toISOString().slice(0, 10);

  // Crear el objeto de ticket con la fecha actual generada automáticamente por MySQL
  const ticket = {
    fecha: fechaFormateada,
    serie: serie,
    estado_ticket_id: 1, // Estado predeterminado al crear el ticket (por ejemplo, "Abierto")
    prioridad_id: prioridad_id,
    cliente_id: clienteId,
    nombre_usuario: nombreUsuario,
    asunto: asunto,
    descripcion: descripcion
  };

  const query = 'INSERT INTO ticket SET ?';

  connection.query(query, ticket, (err, result) => {
    if (err) {
      console.error('Error al crear el ticket:', err);
      res.status(500).json({ error: 'Error al crear el ticket' });
      return;
    }
    console.log('Ticket creado correctamente:', result);
    res.status(201).json({ message: 'Ticket creado correctamente', ticket_id: result.insertId });
  });
});


// Ruta para obtener todos los tickets (solo para administradores)
app.get('/tickets', autenticacion, (req, res) => {
  if (req.user.rol !== 'administrador') {
    return res.status(403).json({ error: 'No tienes permiso para acceder a esta información' });
  }

  // Consulta SQL modificada para obtener el campo "serie" directamente sin ningún formateo adicional
  const query = `
SELECT
    ticket.serie AS serie,
    DATE_FORMAT(ticket.fecha, '%Y-%m-%d %h:%i:%s %p') AS fecha_formateada, 
    prioridad.nombre_prioridad AS prioridad,  
    ticket.nombre_usuario, 
    usuario.completoNyA AS nombre_completo,
    ticket.id_ticket,
    ticket.asunto, 
    ticket.descripcion,
    estado_ticket.nombre_estado AS estado_ticket
FROM 
    ticket
INNER JOIN 
    prioridad ON ticket.prioridad_id = prioridad.id_prioridad
INNER JOIN 
    usuario ON ticket.cliente_id = usuario.id_usuario
INNER JOIN
    estado_ticket ON ticket.estado_ticket_id = estado_ticket.id_estado_ticket;
`;

connection.query(query, (err, results) => {
    if (err) {
        console.error('Error al obtener los tickets:', err);
        res.status(500).json({ error: 'Error al obtener los tickets' });
        return;
    }
    res.status(200).json(results);
});

});




// Ruta para actualizar el estado de un ticket
app.put('/ticket/:ticketId/cerrar', autenticacion, (req, res) => {
  // Verificar si el usuario tiene permisos de administrador
  if (req.user.rol !== 'administrador') {
    return res.status(403).json({ error: 'No tienes permiso para realizar esta acción' });
  }

  // Obtener el ID del ticket desde los parámetros de la URL
  const ticketId = req.params.ticketId;

  // Realizar la actualización del estado del ticket en la base de datos
  const query = 'UPDATE ticket SET estado_ticket_id = 2 WHERE id_ticket = ?'; // Suponiendo que 2 es el ID para "Cerrado"

  connection.query(query, [ticketId], (err, result) => {
    if (err) {
      console.error('Error al actualizar el estado del ticket:', err);
      return res.status(500).json({ error: 'Error al actualizar el estado del ticket' });
    }
    
    // Comprobar si se realizó con éxito la actualización
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    // El estado del ticket se ha actualizado correctamente
    res.status(200).json({ message: 'Estado del ticket actualizado correctamente' });
  });
});




// Ruta para obtener el historial de tickets del usuario
app.get('/historial-tickets', autenticacion, (req, res) => {
  const usuarioId = req.user.id_usuario;
  // Consulta SQL para obtener el historial de tickets del usuario actual con datos relacionados
  const query = `
    SELECT 
      ticket.id_ticket,
      ticket.fecha,
      ticket.serie,
      estado_ticket.nombre_estado AS estado_ticket,
      prioridad.nombre_prioridad AS prioridad,
      ticket.asunto,
      ticket.descripcion
    FROM 
      ticket
    INNER JOIN 
      prioridad ON ticket.prioridad_id = prioridad.id_prioridad
    INNER JOIN
      estado_ticket ON ticket.estado_ticket_id = estado_ticket.id_estado_ticket
    WHERE 
      ticket.cliente_id = ?
  `;

  connection.query(query, [usuarioId], (err, results) => {
    if (err) {
      console.error('Error al obtener el historial de tickets:', err);
      res.status(500).json({ error: 'Error al obtener el historial de tickets' });
      return;
    }

    console.log('Respuesta del backend:', results); // Imprimir la respuesta en la consola

    res.status(200).json(results);
  });
});
    
  



// Ruta para obtener estadísticas de los tickets (solo para administradores)
app.get('/estadisticas-tickets', autenticacion, (req, res) => {
  // Verificar si el usuario es un administrador
  if (req.user.rol !== 'administrador') {
    return res.status(403).json({ error: 'No tienes permiso para acceder a esta información' });
  }

  // Consultas SQL para obtener las estadísticas de los tickets
  const queryTotalTickets = 'SELECT COUNT(*) AS total_tickets FROM ticket';
  const queryTicketsAbiertos = 'SELECT COUNT(*) AS tickets_abiertos FROM ticket WHERE estado_ticket_id = 1';
  const queryTicketsCerrados = 'SELECT COUNT(*) AS tickets_cerrados FROM ticket WHERE estado_ticket_id = 2';

  // Ejecutar las consultas en paralelo utilizando Promise.all
  Promise.all([
    ejecutarConsulta(queryTotalTickets),
    ejecutarConsulta(queryTicketsAbiertos),
    ejecutarConsulta(queryTicketsCerrados)
  ])
  .then(resultados => {
    const totalTickets = resultados[0][0].total_tickets;
    const ticketsAbiertos = resultados[1][0].tickets_abiertos;
    const ticketsCerrados = resultados[2][0].tickets_cerrados;

    // Devolver las estadísticas como respuesta
    res.status(200).json({
      total_tickets: totalTickets,
      tickets_abiertos: ticketsAbiertos,
      tickets_cerrados: ticketsCerrados
    });
  })
  .catch(error => {
    console.error('Error al obtener las estadísticas de los tickets:', error);
    res.status(500).json({ error: 'Error al obtener las estadísticas de los tickets' });
  });
});

// Función para ejecutar una consulta SQL y devolver una promesa
function ejecutarConsulta(query) {
  return new Promise((resolve, reject) => {
    connection.query(query, (err, results) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(results);
    });
  });
}



// Ruta para obtener estadísticas de los tickets del usuario
app.get('/usuario/estadisticas-tickets', autenticacion, (req, res) => {
  // Verificar si el usuario es un cliente
  if (req.user.rol !== 'cliente') {
    return res.status(403).json({ error: 'No tienes permiso para acceder a esta información' });
  }

  const usuarioId = req.user.id_usuario;

  // Consultas SQL para obtener las estadísticas de los tickets del usuario
  const queryTotalTickets = 'SELECT COUNT(*) AS total_tickets FROM ticket WHERE cliente_id = ?';
  const queryTicketsAbiertos = 'SELECT COUNT(*) AS tickets_abiertos FROM ticket WHERE cliente_id = ? AND estado_ticket_id = 1';
  const queryTicketsCerrados = 'SELECT COUNT(*) AS tickets_cerrados FROM ticket WHERE cliente_id = ? AND estado_ticket_id = 2';

  // Ejecutar las consultas en paralelo utilizando Promise.all
  Promise.all([
    ejecutarConsulta(queryTotalTickets, [usuarioId]),
    ejecutarConsulta(queryTicketsAbiertos, [usuarioId]),
    ejecutarConsulta(queryTicketsCerrados, [usuarioId])
  ])
  .then(resultados => {
    const totalTickets = resultados[0][0].total_tickets;
    const ticketsAbiertos = resultados[1][0].tickets_abiertos;
    const ticketsCerrados = resultados[2][0].tickets_cerrados;

    // Devolver las estadísticas como respuesta
    res.status(200).json({
      total_tickets: totalTickets,
      tickets_abiertos: ticketsAbiertos,
      tickets_cerrados: ticketsCerrados
    });
  })
  .catch(error => {
    console.error('Error al obtener las estadísticas de los tickets del usuario:', error);
    res.status(500).json({ error: 'Error al obtener las estadísticas de los tickets del usuario' });
  });
});



// Función para ejecutar una consulta SQL con parámetros y devolver una promesa
function ejecutarConsulta(query, params) {
  return new Promise((resolve, reject) => {
    connection.query(query, params, (err, results) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(results);
    });
  });
}


// Ruta para obtener el nombre completo del usuario después del inicio de sesión
app.get('/usuario/nombre-completo', autenticacion, (req, res) => {
  const usuarioId = req.user.id_usuario;

  // Consulta SQL para obtener el nombre completo del usuario
  const query = 'SELECT CONCAT(nombre, " ", completoNyA) AS nombreCompleto FROM usuario WHERE id_usuario = ?';

  connection.query(query, [usuarioId], (err, results) => {
    if (err) {
      console.error('Error al obtener el nombre completo del usuario:', err);
      res.status(500).json({ error: 'Error al obtener el nombre completo del usuario' });
      return;
    }

    if (results.length === 0) {
      res.status(404).json({ error: 'Nombre completo del usuario no encontrado' });
      return;
    }

    const nombreCompleto = results[0].nombreCompleto;
    res.status(200).json({ nombreCompleto: nombreCompleto });
  });
});





// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});





