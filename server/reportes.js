// Reportes de ventas en Excel (exceljs) y PDF (pdfkit)
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { q } from "./db.js";

const NOMBRES = { hoy: "Hoy", semana: "Esta semana", mes: "Este mes" };

export async function datosReporte(periodo, cond) {
  const [{ generado }] = await q("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i') AS generado");
  const pedidos = await q(
    `SELECT p.id_pedido AS numero, p.fecha_hora, CONCAT(c.nombre, ' ', c.ap_paterno) AS cliente,
            r.nombre_repartidor AS repartidor, p.total_pedido AS total,
            (SELECT SUM(d.costo_insumos) FROM detalle_pedidos d WHERE d.id_pedido = p.id_pedido) AS costo,
            (SELECT GROUP_CONCAT(CONCAT(d.cantidad, 'x ', pl.nombre_platillo,
                    IF(d.opcion IS NULL, '', CONCAT(' (', d.opcion, ')'))) SEPARATOR ', ')
               FROM detalle_pedidos d JOIN platillos pl ON pl.id_platillo = d.id_platillo
              WHERE d.id_pedido = p.id_pedido) AS articulos
     FROM pedidos p
     JOIN clientes c ON c.id_cliente = p.id_cliente
     LEFT JOIN repartidores r ON r.id_repartidor = p.id_repartidor
     WHERE p.estado_pedido = 'Entregado' AND ${cond}
     ORDER BY p.fecha_hora`,
  );
  const platillos = await q(
    `SELECT pl.nombre_platillo AS nombre, c.nombre_categoria AS categoria,
            SUM(d.cantidad) AS unidades, SUM(d.subtotal) AS ventas, SUM(d.costo_insumos) AS costo
     FROM detalle_pedidos d
     JOIN pedidos p ON p.id_pedido = d.id_pedido
     JOIN platillos pl ON pl.id_platillo = d.id_platillo
     JOIN categorias c ON c.id_categoria = pl.id_categoria
     WHERE p.estado_pedido = 'Entregado' AND ${cond}
     GROUP BY pl.id_platillo, pl.nombre_platillo, c.nombre_categoria
     ORDER BY unidades DESC`,
  );
  const dias = await q(
    `SELECT DATE(p.fecha_hora) AS dia, COUNT(*) AS pedidos, SUM(p.total_pedido) AS ventas
     FROM pedidos p WHERE p.estado_pedido = 'Entregado' AND ${cond}
     GROUP BY DATE(p.fecha_hora) ORDER BY dia`,
  );
  const ventas = pedidos.reduce((a, p) => a + Number(p.total), 0);
  const costo = pedidos.reduce((a, p) => a + Number(p.costo ?? 0), 0);
  return {
    periodo,
    nombrePeriodo: NOMBRES[periodo],
    generado,
    pedidos,
    platillos,
    dias,
    resumen: {
      ventas,
      costo,
      utilidad: ventas - costo,
      pedidos: pedidos.length,
      ticketPromedio: pedidos.length ? ventas / pedidos.length : 0,
    },
  };
}

const mxn = (n) =>
  `$${Number(n ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------
export async function generarExcel(datos, stream) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Aroma a Café Co.";
  const cafe = "FF3A2A20";
  const ambar = "FFF08A3C";
  const encabezado = (ws) => {
    const fila = ws.getRow(ws.lastRow ? ws.lastRow.number : 1);
    fila.font = { bold: true, color: { argb: "FFFFFFFF" } };
    fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cafe } };
  };
  const moneda = '"$"#,##0.00';

  // Resumen
  const r = wb.addWorksheet("Resumen");
  r.columns = [{ width: 28 }, { width: 22 }];
  r.addRow(["Aroma a Café Co. — Reporte de ventas"]).font = {
    bold: true,
    size: 14,
    color: { argb: ambar },
  };
  r.addRow(["Periodo", datos.nombrePeriodo]);
  r.addRow(["Generado", datos.generado]);
  r.addRow([]);
  r.addRow(["Indicador", "Valor"]);
  encabezado(r);
  const filas = [
    ["Ventas (pedidos entregados)", datos.resumen.ventas, moneda],
    ["Costo de insumos", datos.resumen.costo, moneda],
    ["Utilidad bruta", datos.resumen.utilidad, moneda],
    ["Pedidos entregados", datos.resumen.pedidos, "0"],
    ["Ticket promedio", datos.resumen.ticketPromedio, moneda],
  ];
  for (const [k, v, fmt] of filas) r.addRow([k, v]).getCell(2).numFmt = fmt;
  if (datos.dias.length > 1) {
    r.addRow([]);
    r.addRow(["Día", "Ventas"]);
    encabezado(r);
    for (const d of datos.dias) r.addRow([d.dia, Number(d.ventas)]).getCell(2).numFmt = moneda;
  }

  // Pedidos
  const p = wb.addWorksheet("Pedidos");
  p.columns = [
    { header: "Pedido", key: "numero", width: 10 },
    { header: "Fecha y hora", key: "fecha_hora", width: 20 },
    { header: "Cliente", key: "cliente", width: 24 },
    { header: "Repartidor", key: "repartidor", width: 20 },
    { header: "Artículos", key: "articulos", width: 50 },
    { header: "Total", key: "total", width: 14, style: { numFmt: moneda } },
    { header: "Costo insumos", key: "costo", width: 14, style: { numFmt: moneda } },
  ];
  encabezado(p);
  datos.pedidos.forEach((x) =>
    p.addRow({ ...x, total: Number(x.total), costo: Number(x.costo ?? 0) }),
  );
  const fin = p.rowCount;
  if (fin > 1) {
    const tot = p.addRow({
      articulos: "TOTAL",
      total: { formula: `SUM(F2:F${fin})` },
      costo: { formula: `SUM(G2:G${fin})` },
    });
    tot.font = { bold: true };
  }
  p.views = [{ state: "frozen", ySplit: 1 }];

  // Platillos
  const pl = wb.addWorksheet("Platillos más vendidos");
  pl.columns = [
    { header: "Platillo", key: "nombre", width: 32 },
    { header: "Categoría", key: "categoria", width: 16 },
    { header: "Unidades", key: "unidades", width: 12 },
    { header: "Ventas", key: "ventas", width: 14, style: { numFmt: moneda } },
    { header: "Costo insumos", key: "costo", width: 14, style: { numFmt: moneda } },
  ];
  encabezado(pl);
  datos.platillos.forEach((x) =>
    pl.addRow({
      ...x,
      unidades: Number(x.unidades),
      ventas: Number(x.ventas),
      costo: Number(x.costo),
    }),
  );

  await wb.xlsx.write(stream);
  stream.end();
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
export function generarPdf(datos, stream) {
  const doc = new PDFDocument({ size: "LETTER", margin: 48 });
  doc.pipe(stream);
  const cafe = "#2b1d14";
  const ambar = "#d9772b";
  const gris = "#6b5d52";
  const ancho = doc.page.width - 96;

  doc.rect(0, 0, doc.page.width, 110).fill(cafe);
  doc
    .fillColor(ambar)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("DARK KITCHEN · REPORTE DE VENTAS", 48, 36);
  doc.fillColor("#f4ead8").font("Times-Bold").fontSize(26).text("Aroma a Café Co.", 48, 52);
  doc
    .fillColor("#cbb9a4")
    .font("Helvetica")
    .fontSize(10)
    .text(`Periodo: ${datos.nombrePeriodo}   ·   Generado: ${datos.generado}`, 48, 86);

  // Tarjetas de indicadores
  const tarjetas = [
    ["Ventas", mxn(datos.resumen.ventas)],
    ["Utilidad bruta", mxn(datos.resumen.utilidad)],
    ["Pedidos", String(datos.resumen.pedidos)],
    ["Ticket promedio", mxn(datos.resumen.ticketPromedio)],
  ];
  const w = (ancho - 3 * 10) / 4;
  tarjetas.forEach(([k, v], i) => {
    const x = 48 + i * (w + 10);
    doc.roundedRect(x, 130, w, 58, 6).fill("#f6efe4");
    doc
      .fillColor(gris)
      .font("Helvetica")
      .fontSize(8)
      .text(k.toUpperCase(), x + 10, 140, { width: w - 20 });
    doc
      .fillColor(cafe)
      .font("Times-Bold")
      .fontSize(16)
      .text(v, x + 10, 156, { width: w - 20 });
  });

  let y = 212;
  const titulo = (t) => {
    if (y > doc.page.height - 140) {
      doc.addPage();
      y = 48;
    }
    doc.fillColor(cafe).font("Times-Bold").fontSize(15).text(t, 48, y);
    y += 24;
  };

  const tabla = (cols, filas) => {
    const dibujarEncabezado = () => {
      doc.rect(48, y, ancho, 18).fill(cafe);
      let x = 48;
      doc.fillColor("#f4ead8").font("Helvetica-Bold").fontSize(8);
      for (const c of cols) {
        doc.text(c.t, x + 5, y + 5, { width: c.w - 10, align: c.a ?? "left" });
        x += c.w;
      }
      y += 18;
    };
    dibujarEncabezado();
    filas.forEach((f, i) => {
      doc.font("Helvetica").fontSize(8);
      const alto = Math.max(
        16,
        ...cols.map((c, j) => doc.heightOfString(String(f[j] ?? ""), { width: c.w - 10 }) + 8),
      );
      if (y + alto > doc.page.height - 48) {
        doc.addPage();
        y = 48;
        dibujarEncabezado();
        doc.font("Helvetica").fontSize(8);
      }
      if (i % 2 === 0) doc.rect(48, y, ancho, alto).fill("#faf6ef");
      let x = 48;
      doc.fillColor("#2b1d14");
      cols.forEach((c, j) => {
        doc.text(String(f[j] ?? ""), x + 5, y + 4, { width: c.w - 10, align: c.a ?? "left" });
        x += c.w;
      });
      y += alto;
    });
    y += 16;
  };

  // Barras de platillos más vendidos
  titulo("Platillos más vendidos");
  const top = datos.platillos.slice(0, 8);
  const max = Math.max(1, ...top.map((p) => Number(p.unidades)));
  if (!top.length) {
    doc
      .fillColor(gris)
      .font("Helvetica")
      .fontSize(10)
      .text("Sin ventas entregadas en este periodo.", 48, y);
    y += 24;
  }
  top.forEach((p, i) => {
    doc
      .fillColor(cafe)
      .font("Helvetica")
      .fontSize(9)
      .text(p.nombre, 48, y + 2, { width: 170 });
    const largo = ((ancho - 250) * Number(p.unidades)) / max;
    doc.roundedRect(225, y, Math.max(largo, 3), 12, 3).fill(i === 0 ? ambar : "#c9b49c");
    doc
      .fillColor(gris)
      .fontSize(8)
      .text(`${p.unidades} u · ${mxn(p.ventas)}`, 230 + largo, y + 2);
    y += 18;
  });
  y += 12;

  titulo("Detalle por platillo");
  tabla(
    [
      { t: "Platillo", w: ancho * 0.38 },
      { t: "Categoría", w: ancho * 0.18 },
      { t: "Unidades", w: ancho * 0.12, a: "right" },
      { t: "Ventas", w: ancho * 0.16, a: "right" },
      { t: "Costo", w: ancho * 0.16, a: "right" },
    ],
    datos.platillos.map((p) => [p.nombre, p.categoria, p.unidades, mxn(p.ventas), mxn(p.costo)]),
  );

  titulo("Pedidos entregados");
  tabla(
    [
      { t: "#", w: ancho * 0.08 },
      { t: "Fecha", w: ancho * 0.17 },
      { t: "Cliente", w: ancho * 0.18 },
      { t: "Artículos", w: ancho * 0.43 },
      { t: "Total", w: ancho * 0.14, a: "right" },
    ],
    datos.pedidos.map((p) => [
      p.numero,
      p.fecha_hora.slice(0, 16),
      p.cliente,
      p.articulos,
      mxn(p.total),
    ]),
  );

  doc.end();
}
