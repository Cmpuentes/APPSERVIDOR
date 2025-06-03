const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs'); // Si usaste bcryptjs
const crypto = require('crypto');
const { parse } = require('date-fns');
const generateToken = require('../utils/token'); // O la ruta donde esté tu archivo



//Función para formatear la fecha
function formatearFechas(fecha) {
    const dia = String(fecha.getDate()).padStart(2, '0'); //Día con dos dígitos
    const mes = String(fecha.getMonth() + 1).padStart(2, '0'); //Mes (0-index, por eso el +1)
    const año = fecha.getFullYear(); //Año completo

    let horas = fecha.getHours(); //Horas (formato 24 horas)
    const minutos = String(fecha.getMinutes()).padStart(2, '0'); //Minutos con dos dígitos
    const amPm = horas >= 12 ? 'PM' : 'AM'; //Determina si es AM o PM

    //Convertir a formato 12 horas
    horas = horas % 12 || 12; //Convertir 0 a 12 para media noche

    return `${dia}-${mes}-${año} ${String(horas).padStart(2, '0')}:${minutos} ${amPm}`;
}


//Función para formatear la fecha para turno
function formatearFechaTurno(fecha) {
    const dia = String(fecha.getDate()).padStart(2, '0'); //Día con dos dígitos
    const mes = String(fecha.getMonth() + 1).padStart(2, '0'); // Mes (0-indexed, por eso es +1)
    const año = fecha.getFullYear(); //Año completo

    //Formato final "día/mes/año"
    return `${dia}/${mes}/${año}`;
}

//ENDPOINT LOGIN
router.post('/login', async (req, res) => {
    const { user, password, turno } = req.body;
    console.log("Valores que manda la app: ", user, password, turno);

    try {
        // Buscar usuario por documento
        const [rows] = await db.query('SELECT * FROM empleado WHERE documento = ?', [user]);

        if (rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Usuario no existe' });
      }

      if (rows[0].password !== password) {
        return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
    }

        const usuario = rows[0];
        const nombreCompleto = `${usuario.nombres} ${usuario.apellidos}`;
        const now = new Date();
        const expiration = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 días

        // Consultar si hay sesión activa
        const [sessionRows] = await db.query(`
    SELECT * FROM sesiones 
    WHERE idempleado = ? AND estado = 'activo' AND expiracion > NOW()
  `, [usuario.idempleado]
        );

        let token = "";
        let message = "";

        if (sessionRows.length > 0) {
            // Reutilizar sesión activa
            token = sessionRows[0].token;
            message = 'Sesión activa recuperada correctamente';
        } else {
            // Crear nueva sesión
            token = generateToken();

            await db.query(`
        INSERT INTO sesiones (idempleado, token, fecha_inicio, expiracion, estado) 
        VALUES (?, ?, ?, ?, 'activo')`,
                [usuario.idempleado, token, now, expiration]
            );

            message = 'Sesión iniciada correctamente';
        }

        // Obtener número de turno
        let nextTurn;
        const [activeTurn] = await db.query(
            'SELECT numero_turno FROM inicio_turno WHERE empleado = ? AND estado = "Activo"',
            [nombreCompleto]
        );

        if (activeTurn.length > 0) {
            nextTurn = activeTurn[0].numero_turno;
        } else {
            const [lastTurn] = await db.query('SELECT MAX(numero_turno) as lastTurn FROM inicio_turno');
            nextTurn = lastTurn[0]?.lastTurn ? lastTurn[0].lastTurn + 1 : 1;
        }

        // Formatear fecha
        const fechaInicio = new Date();
        const fechaFormateada = formatearFechas(fechaInicio);
        const fechaFormateadaTurno = formatearFechaTurno(fechaInicio);
        const turnoConFecha = `${turno} ${fechaFormateadaTurno}`;

        // Crear turno solo si no existe
        if (activeTurn.length === 0) {
            await db.query(
                'INSERT INTO inicio_turno (empleado, fecha_inicio, turno, numero_turno, estado) VALUES (?, ?, ?, ?, ?)',
                [nombreCompleto, fechaFormateada, turnoConFecha, nextTurn, "Activo"]
            );
        }

        // Respuesta final
        res.json({
            success: true,
            message,
            data: {
                nombre: nombreCompleto,
                fechaInicio: fechaFormateada,
                turno: turnoConFecha,
                numeroTurno: nextTurn,
                token: token
            }
        });

    } catch (err) {
        console.error("Error en el servidor:", err);
        res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

//ENDPOINT INGRESO
router.post('/ingreso', async (req, res) => {
    const { turno, placa, tipoVehiculo, tipoServicio, cliente, zona, observaciones, numeroTurno, empleado } = req.body;
    console.log("Datos recibidos para ingreso:", req.body);

    try {
        // Validar que todos los campos requeridos estén presentes
        if (!turno || !placa || !tipoVehiculo || !tipoServicio || !cliente || !zona || !numeroTurno || !empleado) {
            console.log("Faltan campos obligatorios");
            return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });
        }

        //Formatear la fecha de ingreso
        const fechaInicio = new Date();
        const fechaFormateada = formatearFechas(fechaInicio)

        //Formatear fecha para turno
        //const fechaFormateadaTurno = formatearFechaTurno(fechaInicio)

        //Concatenar turno con fecha
        //const tunoConFecha = `${turno} ${fechaFormateadaTurno}`

        // Insertar los datos en la tabla "ingreso"
        await db.query(
            `INSERT INTO ingreso (
            turno, placa, fechaingreso, tipovehiculo, tiposervicio, cliente, zona, observaciones, estado, numeroturno, empleado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                turno,
                placa,
                fechaFormateada,
                tipoVehiculo,
                tipoServicio,
                cliente,
                zona,
                observaciones || null, // Si no hay observaciones, almacenar NULL
                "Activo",
                numeroTurno,
                empleado,
            ]
        );
        console.log("Ingreso registrado correctamente");

        // Respuesta final
        const response = {
            success: true,
            message: "Ingreso exitoso"
        };

        console.log("Respuesta enviada al cliente:", response);
        res.json(response);

    } catch (err) {
        console.error("Error en el servidor:", err);
        res.status(500).json({
            success: false,
            message: 'Error del servidor'
        });
    }
});

//RNDPOINT PREPAGO
router.post('/ingreso/prepago', async (req, res) => {
    const { placa } = req.body;

    // Log: Verificar si se recibió la placa
    console.log("Placa recibida:", placa);

    if (!placa) {
        console.error("Error: La placa no fue proporcionada.");
        return res.status(400).json({ success: false, message: "La placa es requerida" });
    }

    try {
        // Log: Consulta SQL que se va a ejecutar
        console.log("Ejecutando consulta SQL para placa:", placa);

        const [rows] = await db.query(`
        SELECT tipo_vehiculo, tipo_servicio, cliente 
        FROM cliente 
        WHERE placa = ? AND tipo_servicio = 'PREPAGO'
        ORDER BY fechaingreso DESC
        LIMIT 1
      `, [placa]);

        // Log: Resultado de la consulta
        console.log("Resultado de la consulta:", rows);

        if (rows.length === 0) {
            console.warn(`Advertencia: No se encontró un ingreso PREPAGO para la placa ${placa}`);
            return res.status(404).json({ success: false, message: "No se encontró un ingreso PREPAGO para esta placa" });
        }

        // Log: Datos devueltos al cliente
        console.log("Datos devueltos al cliente:", rows[0]);

        res.json({
          success: true,
          message: "Placa prepago", // ✅ requerido para que coincida con PrepagoRes
          data: rows[0]
      });

    } catch (err) {
        // Log: Error capturado durante la ejecución
        console.error("Error en la consulta de prepago:", err.message);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }

});

//ENDPOINT PLACA SALIDA
router.post('/salida', async (req, res) => {
    const { placa } = req.body;
    //Log: Mostrar la placa recibida
    console.log("Placa recibida para salida:", placa);
  
    // Validación: Verificar si la placa está presente
    if (!placa) {
      console.error("Error: La placa no fue proporcionada.");
      return res.status(400).json({ success: false, message: "La placa es requerida" });
    }
  
    try {
      // Log: Indicar que se está realizando la consulta a la base de datos
      console.log("Consultando en la base de datos para la placa:", placa);
      // Consulta SQL modificada para incluir la condición de estado = 'Activo'
  
  
      const [rows] = await db.query(`
        SELECT idingreso, fechaingreso, cliente, zona, tipovehiculo, tiposervicio, numeroturno, empleado
        FROM ingreso 
        WHERE placa = ? AND estado = 'Activo'
        ORDER BY fechaingreso DESC
        LIMIT 1
      `, [placa]);
  
      // Log: Mostrar los resultados obtenidos de la base de datos
      console.log("Resultados obtenidos de la base de datos:", rows);
  
      // Validación: Verificar si se encontraron registros
      if (rows.length === 0) {
        console.warn("Advertencia: No se encontró ningún registro activo para esta placa.");
        return res.status(404).json({ success: false, message: "No se encontró ningún registro activo para esta placa" });
      }
  
      // Log: Indicar que se encontró un registro válido
      console.log("Registro encontrado para la placa:", placa, "Datos:", rows[0]);
  
      // Respuesta exitosa con los datos solicitados
      res.json({
        success: true,
        data: rows[0]
      });
  
    } catch (err) {
      // Log: Capturar y mostrar errores inesperados
      console.error("Error en la consulta de salida:", err.message || err);
      res.status(500).json({ success: false, message: "Error del servidor" });
    }
  });

  //ENDPOINT REGISTRAR SALIDA
  router.post('/registro/salida', async (req, res) => {
    const {
      idingreso, placa, tipovehiculo, tiposervicio, cliente, fechaingreso, fechasalida, zona, dias, horas, minutos,
      costototal, numerorecibo, descuento, subtotal, efectivo, tarjeta, transferencia, total, turno, turnoentrada,
      empleadoentrada, turnosalida, empleadosalida
    } = req.body;
  
    console.log("Datos recibidos para el registro de la salida:", req.body);
  
    try {
      // Validar que todos los campos requeridos estén presentes
      if (
        idingreso == null || placa == null || tipovehiculo == null || tiposervicio == null || cliente == null ||
        fechaingreso == null || fechasalida == null || zona == null || dias == null || horas == null || minutos == null ||
        costototal == null || numerorecibo == null || descuento == null || subtotal == null || efectivo == null ||
        tarjeta == null || transferencia == null || total == null || turno == null || turnoentrada == null ||
        empleadoentrada == null || turnosalida == null || empleadosalida == null
      ) {
        console.log("Faltan campos obligatorios");
        return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });
      }
  
      // Validar tipos de datos
      function validarDatos(datos) {
        const { dias, horas, minutos, costototal, descuento, subtotal, efectivo, tarjeta, transferencia, total } = datos;
  
        // Validar números
        if (![dias, horas, minutos, costototal, descuento, subtotal, efectivo, tarjeta, transferencia, total].every(Number.isFinite)) {
          throw new Error("Algunos campos numéricos son inválidos");
        }
  
        const formato = "dd-MM-yyyy hh:mm a"; // el formato que recibes
        const fechaIngreso = parse(datos.fechaingreso, formato, new Date());
        const fechaSalida = parse(datos.fechasalida, formato, new Date());
  
        // Validar si alguna falló
        if (isNaN(fechaIngreso) || isNaN(fechaSalida)) {
          throw new Error("Las fechas de ingreso o salida son inválidas");
        }
      }
  
      validarDatos(req.body);
  
      // Obtener una conexión del pool
      const connection = await db.getConnection();
  
      try {
        await connection.beginTransaction();
        // Obtener el último número de factura
        const [lastNumfactura] = await db.query('SELECT MAX(numfactura) as lastNumfactura FROM salida');
        const numFactura = lastNumfactura[0].lastNumfactura ? lastNumfactura[0].lastNumfactura + 1 : 1;
        console.log("Siguiente número de factura:", numFactura);
  
        // Formatear fecha de salida
        const fechaDeSalida = new Date();
        const fechaDeSalidaFormateada = formatearFechaTurno(fechaDeSalida)
        //const turnoConFecha = `${turno} ${fechaDeSalidaFormateada}`;
        console.log("Turno:", turno);
  
        // Insertar los datos en la tabla "salida"
        await connection.query(
          `INSERT INTO salida (
                    idingreso, placa, tipovehiculo, tiposervicio, cliente, fechaentrada, fechasalida, zona, 
                    numfactura, dias, horas, minutos, valor, numero_recibo, descuento, subtotal, efectivo, 
                    tarjeta, transferencia, total, turno, turnoentrada, empleadoentrada, turnosalida, empleadosalida
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            idingreso, placa, tipovehiculo, tiposervicio, cliente, fechaingreso, fechasalida, zona, numFactura,
            dias, horas, minutos, costototal, numerorecibo, descuento, subtotal, efectivo, tarjeta, transferencia,
            total, turno, turnoentrada, empleadoentrada, turnosalida, empleadosalida
          ]
        );
  
        console.log("Salida registrada correctamente");
  
        // Actualizar el estado en la tabla "ingreso"
        await connection.query(
          `UPDATE ingreso SET estado = ? WHERE idingreso = ?`,
          ["Finalizado", idingreso]
        );
        console.log(`Estado del ingreso con ID ${idingreso} actualizado a "Finalizado"`);
  
        // Confirmar la transacción
        await connection.commit();
        connection.release(); // 🔴 IMPORTANTE: liberar la conexión
  
        // Respuesta final
        const response = {
          success: true,
          message: "Salida registrada exitosamente",
          data: {
            numfactura: numFactura
          }
        };
  
        console.log("Respuesta enviada al cliente:", response);
        res.json(response);
      } catch (err) {
        // Revertir la transacción en caso de error
        await connection.rollback();
        console.error("Error en la transacción:", err);
        res.status(500).json({ success: false, message: "Error del servidor" });
      }
    } catch (err) {
      console.error("Error en el servidor:", err);
      res.status(500).json({
        success: false,
        message: 'Error del servidor'
      });
    }
  });

  //ENDPOINT TARIFA
  router.post('/tarifas', async (req, res) => {
    const { tipoServicio, tipoVehiculo } = req.body;
  
    console.log('Parámetros recibidos:');
    console.log(`- tipoServicio: ${tipoServicio}`);
    console.log(`- tipoVehiculo: ${tipoVehiculo}`);
  
    if (!tipoServicio || !tipoVehiculo) {
      console.warn('Error: Faltan parámetros requeridos.');
      return res.status(400).json({
        success: false,
        message: 'Faltan parámetros: tipoServicio y tipoVehiculo son requeridos.'
      });
    }
  
    try {
      const [rows] = await db.query(`
        SELECT precio12h, descuentorecibo, preciohoras
        FROM tarifas
        WHERE tiposervicio = ? AND tipovehiculo = ?
      `, [tipoServicio, tipoVehiculo]);
  
      console.log('Resultados de la consulta SQL:');
      console.log(rows);
  
      if (rows.length === 0) {
        console.warn('Advertencia: No se encontró ninguna tarifa.');
        return res.status(404).json({
          success: false,
          message: 'No se encontró una tarifa para el tipo de servicio y vehículo especificados.'
        });
      }
  
      console.log('Tarifa encontrada:', rows[0]);
  
      res.json({
        success: true,
        data: rows[0]
      });
  
      console.log('Respuesta enviada al cliente con éxito.');
    } catch (err) {
      console.error('Error al consultar la base de datos:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor.'
      });
    }
  });

  //CHECK SESSION
  // CHECK SESSION – Validar sesión activa
router.get('/check-session', async (req, res) => {
  const token = req.query.token;

  console.log("🔍 [check-session] Iniciando validación de sesión...");

  if (!token) {
      console.warn("🚫 Token no proporcionado");
      return res.status(400).json({
          success: false,
          message: 'Token no proporcionado'
      });
  }

  console.log(`🗝️ Token recibido: ${token}`);

  try {
      console.log("🔍 Buscando sesión en la base de datos...");
      const [rows] = await db.query(`
          SELECT 
              e.nombres,
              e.apellidos,
              s.estado AS sesion_estado,
              s.expiracion AS sesion_expiracion,
              i.fecha_inicio,
              i.turno,
              i.numero_turno
          FROM sesiones s
          JOIN empleado e ON s.idempleado = e.idempleado
          LEFT JOIN inicio_turno i 
              ON i.empleado = CONCAT(e.nombres, ' ', e.apellidos) 
              AND i.estado = 'Activo'
          WHERE s.token = ?
      `, [token]);

      if (rows.length === 0) {
          console.warn(`❌ Sesión no encontrada para el token: ${token}`);
          return res.status(404).json({
              success: false,
              message: 'Sesión no encontrada'
          });
      }

      const sesion = rows[0];

      console.log(`✅ Sesión encontrada: ${sesion.sesion_estado} - Expira: ${sesion.sesion_expiracion}`);

      if (sesion.sesion_estado !== 'activo') {
          console.warn(`🔒 La sesión está inactiva: ${token}`);
          return res.status(401).json({
              success: false,
              message: 'La sesión ha sido cerrada'
          });
      }

      const ahora = new Date();
      const expiracion = new Date(sesion.sesion_expiracion);

      console.log(`⏳ Ahora: ${ahora} | Expiración: ${expiracion}`);

      if (expiracion < ahora) {
          console.warn(`⏰ Sesión expirada para el token: ${token}`);
          return res.status(401).json({
              success: false,
              message: 'La sesión ha expirado'
          });
      }

      // ✅ Todo OK – Devolver datos del usuario
      console.log(`🟢 Sesión válida para el usuario: ${sesion.nombres} ${sesion.apellidos}`);
      console.log(`📄 Datos devueltos: turno ${sesion.numero_turno}, fecha ${sesion.fecha_inicio}`);

      return res.json({
          success: true,
          message: 'Sesión válida',
          data: {
              nombre: `${sesion.nombres} ${sesion.apellidos}`,
              fechaInicio: sesion.fecha_inicio,
              turno: sesion.turno,
              numeroTurno: sesion.numero_turno
          }
      });

  } catch (err) {
      console.error("🚨 Error interno al validar sesión:", err.message);
      console.error("Detalles del error:", err.stack);

      return res.status(500).json({
          success: false,
          message: 'Error interno del servidor'
      });
  }
});

  //ENDPOINT CIERRE
  router.post('/cierre', async (req, res) => {
    const { numeroTurno } = req.body
    console.log("Dato recibido en el registro de cierre", numeroTurno)
  
    //Validar que se haya proporcionado el número de turno
    if (!numeroTurno || isNaN(numeroTurno)) {
      console.log("Error: El número de turno es invalido")
      return res.status(400).json({ success: false, message: "El número de turno es requerido y debe ser un número" })
    }
  
    try {
      //Consultar el total de vehículos en la tabla ingreso
      const [ingresoResult] = await db.query(
        'SELECT COUNT(tipovehiculo) AS totalVehiculosActivos FROM ingreso WHERE estado = "Activo"',
        [numeroTurno]
      )
  
      const totalVehiculosActivos = ingresoResult[0].totalVehiculosActivos || 0
      console.log("Total de vehículos", totalVehiculosActivos)
  
      //Consultar los totales de efectivo, tarjrta y transferencia en la tabla salida
      const [salidaResult] = await db.query(
        'SELECT SUM(efectivo) AS totalEfectivo, SUM(tarjeta) AS totalTarjeta, SUM(transferencia) AS totalTransferencia FROM salida WHERE turnosalida = ?',
        [numeroTurno]
      )
  
      const totalEfectivo = salidaResult[0].totalEfectivo || 0;
      const totalTarjeta = salidaResult[0].totalTarjeta || 0;
      const totalTransferencia = salidaResult[0].totalTransferencia || 0;
      console.log("Total de efectivo", totalEfectivo)
      console.log("Total de tarjeta", totalTarjeta)
      console.log("Total de transferencia", totalTransferencia)
  
      // Consultar el total de abonos en la tabla Abono
      const[abonoResult] = await db.query(
        'SELECT SUM(efectivo) AS totalEfectivoAbono, SUM(tarjeta) AS totalTarjetaAbono, SUM(transferencia) AS totalTransferenciaAbono FROM abonos WHERE numero_turno = ?',
        [numeroTurno]
      )
  
      const totalEfectivoAbono = abonoResult[0].totalEfectivoAbono || 0;
      const totalTarjetaAbono = abonoResult[0].totalTarjetaAbono || 0;
      const totalTransferenciaAbono = abonoResult[0].totalTransferenciaAbono || 0;
      console.log("Total de efectivo abono", totalEfectivoAbono)
      console.log("Total de tarjeta abono", totalTarjetaAbono)
      console.log("Total de transferencia abono", totalTransferenciaAbono)
  
      //Construir la respuesta
      const response = {
        success: true,
        data: {
          totalVehiculosActivos,
          totalEfectivo,
          totalTarjeta,
          totalTransferencia,
          totalEfectivoAbono,
          totalTarjetaAbono,
          totalTransferenciaAbono
        }
      }
  
      console.log("Datos calculados para el turno:", response);
      res.json(response);
  
    } catch (err) {
      console.error("Error en el servidor:", err);
      res.status(500).json({ success: false, message: "Error del servidor" });
    }
  });

  //ENDPOINT REGISTRO DE CIERRE
  
router.post('/cierre/registro', async(req, res)=>{
    const {
      turno, numeroturno, empleado, fechaingreso, fechasalida, recibidos, totalvehiculos, base, efectivo,
      tarjeta, transferencia, otrosingresos, efectivoliquido, totalrecaudado, observaciones, totalabonos
    } = req.body
  
    try {
      //Validar que los campos esten presentes
      if (
        turno == null || numeroturno == null || empleado == null || fechaingreso == null || fechasalida == null
        || recibidos == null || totalvehiculos == null || base == null || efectivo == null || tarjeta == null
        || transferencia == null || otrosingresos == null || efectivoliquido == null || totalrecaudado == null
        || observaciones == null || totalabonos == null
      ) {
        console.log(
          "Faltan campos obligatorios",turno, numeroturno, empleado, fechaingreso,
          fechasalida, recibidos, totalvehiculos, base, efectivo, tarjeta, transferencia, otrosingresos, efectivoliquido,
          totalrecaudado, observaciones, totalabonos
        );
        return res.status(400).json({ 
          success: false, message: 'Todos los campos son requeridos'
        });
      }
  
      //Formatear la fecha de ingreso
      const fechaInicio = new Date();
  
      //Formatear fecha para turno
      const fechaFormateadaTurno = formatearFechaTurno(fechaInicio)
  
      //Concatenar turno con fecha
      //const turnoConFecha = `${turno} ${fechaFormateadaTurno}`
  
      //Insertar los datos en la tabla inicio_turno
      await db.query(
        `INSERT INTO salida_turno (
      turno, numero_turno, empleado, fechaingreso, fechasalida, recibos, total_vehiculos, base, efectivo, 
      tarjeta, transferencia, otros_ingresos, efectivo_liquido, total_recaudado, estado, observaciones, total_abonos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          turno, numeroturno, empleado, fechaingreso, fechasalida, recibidos, totalvehiculos, base, efectivo, tarjeta,
          transferencia, otrosingresos, efectivoliquido, totalrecaudado, "0", observaciones, totalabonos
        ]
      )
      console.log("Ingreso registrado correctamente");
  
      // Actualizamos el estado del turno en inicio_turno
      await db.query(
        'UPDATE inicio_turno SET estado = ? WHERE numero_turno = ?',
        ['Finalizado', numeroturno]
      );
      console.log("Estado del turno actualizado a 'Finalizado'");
  
      // Respuesta final
      const response = {
        success: true,
        message: "Ingreso exitoso"
      };
  
      console.log("Respuesta enviada al cliente:", response);
      res.json(response);
    } catch (err) {
      console.error("Error en el servidor:", err);
      res.status(500).json({
        success: false,
        message: 'Error del servidor'
      });
    }
  });

  // LOGOUT
  router.post('/logout', async (req, res) => {
    console.log("🚪 [LOGOUT] Iniciando proceso de cierre de sesión...");

    const { token } = req.body;

    if (!token) {
        console.warn("🚫 [LOGOUT] Token no proporcionado");
        return res.status(400).json({
            success: false,
            message: 'Token no proporcionado'
        });
    }

    console.log(`🗝️ [LOGOUT] Token recibido: ${token}`);

    try {
        // Verificar si el token existe en la base de datos
        console.log(`🔍 [LOGOUT] Buscando sesión con token: ${token}`);
        const [rows] = await db.query('SELECT * FROM sesiones WHERE token = ?', [token]);

        if (rows.length === 0) {
            console.warn(`❌ [LOGOUT] Sesión no encontrada para el token: ${token}`);
            return res.status(404).json({
                success: false,
                message: 'Sesión no encontrada'
            });
        }

        const session = rows[0];
        console.log(`✅ [LOGOUT] Sesión encontrada para el usuario: ${session.idempleado}`);

        // Marcar sesión como inactiva
        console.log(`🔒 [LOGOUT] Cerrando sesión remota para token: ${token}`);
        await db.query(
            'UPDATE sesiones SET estado = "inactivo" WHERE token = ?',
            [token]
        );

        console.log(`🟢 [LOGOUT] Sesión cerrada correctamente para: ${token}`);
        return res.json({
            success: true,
            message: 'Sesión cerrada correctamente'
        });

    } catch (err) {
        console.error(`🚨 [LOGOUT] Error interno al cerrar sesión: ${err.message}`);
        console.error(`Detalles del error:`, err.stack);

        return res.status(500).json({
            success: false,
            message: 'Error al cerrar sesión'
        });
    }
});
  
  //ENDPOINT PARA RECUPERAR SESIÓN
  router.post('/recuperar-sesion', async (req, res) => {
    console.log('[INFO] Iniciando proceso de recuperación de sesión...');

    const { documento } = req.body;
    console.log(`[DEBUG] Documento recibido: ${documento}`);

    try {
        // 1. Buscar usuario por documento
        console.log(`[INFO] Buscando empleado con documento: ${documento}`);
        const [userRows] = await db.query('SELECT * FROM empleado WHERE documento = ?', [documento]);

        if (userRows.length === 0) {
            const mensaje = "Usuario no encontrado";
            console.warn(`[WARN] Usuario no encontrado con documento: ${documento}`);
            console.log(`[RESPONSE] Enviando respuesta: ${mensaje}`);
            return res.status(404).json({ success: false, message: mensaje });
        }

        const usuario = userRows[0];
        const nombreCompleto = `${usuario.nombres} ${usuario.apellidos}`;
        console.log(`[INFO] Usuario encontrado: ${nombreCompleto} (ID: ${usuario.idempleado})`);

        // 2. Buscar sesión activa
        console.log(`[INFO] Buscando sesión activa para el empleado ID: ${usuario.idempleado}`);
        const [sessionRows] = await db.query(
            'SELECT * FROM sesiones WHERE idempleado = ? AND estado = "activo" AND expiracion > NOW()',
            [usuario.idempleado]
        );

        if (sessionRows.length === 0) {
            const mensaje = "No hay sesión activa";
            console.warn(`[WARN] No hay sesión activa para el empleado ID: ${usuario.idempleado}`);
            console.log(`[RESPONSE] Enviando respuesta: ${mensaje}`);
            return res.status(404).json({ success: false, message: mensaje });
        }

        console.log(`[INFO] Sesión activa encontrada para el empleado ID: ${usuario.idempleado}`);

        // 3. Buscar turno activo
        console.log(`[INFO] Buscando turno activo para el empleado: ${nombreCompleto}`);
        const [turnoRows] = await db.query(`
            SELECT empleado, fecha_inicio, turno, numero_turno 
            FROM inicio_turno 
            WHERE empleado = ? AND estado = 'Activo'
            ORDER BY fecha_inicio DESC
            LIMIT 1
        `, [nombreCompleto]);

        if (turnoRows.length === 0) {
            const mensaje = "No hay turno activo para este usuario";
            console.warn(`[WARN] No se encontró turno activo para el empleado: ${nombreCompleto}`);
            console.log(`[RESPONSE] Enviando respuesta: ${mensaje}`);
            return res.status(404).json({ success: false, message: mensaje });
        }

        const turno = turnoRows[0];
        console.log(`[INFO] Turno activo encontrado: Número ${turno.numero_turno}, Tipo: ${turno.turno}`);

        // 4. Preparar y enviar respuesta final
        const respuestaFinal = {
            success: true,
            nombre: nombreCompleto,
            fechaInicio: turno.fecha_inicio,
            turno: turno.turno,
            numeroTurno: turno.numero_turno,
            token: sessionRows[0].token
        };

        console.log(`[RESPONSE] Enviando respuesta exitosa para: ${nombreCompleto}`, respuestaFinal);
        return res.json(respuestaFinal);

    } catch (err) {
        const mensajeError = "Error del servidor";
        console.error(`[ERROR] Error en /recuperar-sesion:`, err);
        console.error(`[RESPONSE] Enviando respuesta: ${mensajeError}`);
        return res.status(500).json({ success: false, message: mensajeError });
    }
});
  

module.exports = router; // ✅ ESTO es lo más importante