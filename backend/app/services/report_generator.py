"""
Generador de Reportes Ejecutivos en PDF Corporativo (Sprint 2 - plan_v4.md - v0.6.0)
Tecnología: ReportLab 5.x
Salida: Flujo binario application/pdf en memoria (io.BytesIO)

Secciones del Reporte Ejecutivo:
1. Encabezado Corporativo Tokioba & Metadatos de Auditoría.
2. Scorecard de KPIs de Flota / Vehículo (Km, Horas Motor, Ralentí y Costo en Pesos).
3. Resumen y Tabla de Viajes Realizados en el Período.
4. Registro de Alertas Críticas e Incidentes de Seguridad.
5. Estado del Semáforo Preventivo de Mantenimiento Mecánico.
"""
import io
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        KeepTogether
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
    from reportlab.pdfgen import canvas
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    letter = None
    colors = None
    inch = 72
    SimpleDocTemplate = Paragraph = Spacer = Table = TableStyle = KeepTogether = None
    getSampleStyleSheet = ParagraphStyle = None
    TA_CENTER = TA_LEFT = TA_RIGHT = TA_JUSTIFY = None
    canvas = None

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import desc, func

from app.models.models import Device, DeviceState, VehicleTrip, VehicleAlert, MaintenancePlan, User

logger = logging.getLogger("report_generator")

if REPORTLAB_AVAILABLE:
    # Paleta Corporativa Tokioba
    COLOR_PRIMARY = colors.HexColor("#0f172a")     # Slate 900
    COLOR_SECONDARY = colors.HexColor("#1e293b")   # Slate 800
    COLOR_ACCENT = colors.HexColor("#0284c7")      # Sky 600
    COLOR_TEXT_MAIN = colors.HexColor("#1e293b")   # Charcoal
    COLOR_TEXT_MUTED = colors.HexColor("#64748b")  # Slate 500
    COLOR_BG_LIGHT = colors.HexColor("#f8fafc")    # Slate 50
    COLOR_BORDER = colors.HexColor("#cbd5e1")      # Slate 300

    COLOR_CRITICAL = colors.HexColor("#dc2626")    # Red 600
    COLOR_WARNING = colors.HexColor("#d97706")     # Amber 600
    COLOR_SUCCESS = colors.HexColor("#16a34a")     # Green 600

    class NumberedCanvas(canvas.Canvas):
        """Canvas de dos pasadas para calcular dinámicamente el total de páginas 'Página X de Y'"""
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._saved_page_states = []

        def showPage(self):
            self._saved_page_states.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            num_pages = len(self._saved_page_states)
            for state in self._saved_page_states:
                self.__dict__.update(state)
                self.draw_page_decorations(num_pages)
                super().showPage()
            super().save()

        def draw_page_decorations(self, page_count: int):
            self.saveState()
            self.setFont("Helvetica", 8)
            self.setFillColor(COLOR_TEXT_MUTED)

            # Línea superior de pie de página
            self.setStrokeColor(COLOR_BORDER)
            self.setLineWidth(0.5)
            self.line(36, 32, 612 - 36, 32)

            # Texto pie de página
            footer_left = "Tokioba Telematics Platform (v0.6.0) • Documento Confidencial de Auditoría"
            footer_right = f"Página {self._pageNumber} de {page_count}"

            self.drawString(36, 20, footer_left)
            self.drawRightString(612 - 36, 20, footer_right)
            self.restoreState()
else:
    COLOR_PRIMARY = COLOR_SECONDARY = COLOR_ACCENT = COLOR_TEXT_MAIN = COLOR_TEXT_MUTED = COLOR_BG_LIGHT = COLOR_BORDER = None
    COLOR_CRITICAL = COLOR_WARNING = COLOR_SUCCESS = None
    NumberedCanvas = None


async def generate_executive_pdf_report(
    db: AsyncSession,
    user: User,
    device_id: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None
) -> io.BytesIO:
    """
    Genera en memoria un documento PDF corporativo con ReportLab.
    """
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("ReportLab no está instalado en el servidor. Ejecute 'pip install reportlab' para habilitar la generación de reportes ejecutivos en PDF.")

    now_utc = datetime.now(timezone.utc)
    if to_date is None:
        to_date = now_utc
    if from_date is None:
        from_date = to_date - timedelta(days=30)

    # 1. Obtener lista de dispositivos autorizados
    dev_query = select(Device)
    if user.role != "admin":
        dev_query = dev_query.where(Device.user_id == user.id)
    if device_id and device_id.lower() != "all":
        dev_query = dev_query.where(Device.device_id == device_id)
    
    dev_res = await db.execute(dev_query.order_by(Device.name))
    devices: List[Device] = list(dev_res.scalars().all())

    if not devices:
        raise ValueError("No se encontraron dispositivos autorizados para generar el reporte.")

    device_ids = [d.device_id for d in devices]

    # 2. Consultar Estados de Dispositivos
    states_res = await db.execute(select(DeviceState).where(DeviceState.device_id.in_(device_ids)))
    states_dict = {s.device_id: s for s in states_res.scalars().all()}

    # 3. Consultar Viajes del Período
    trips_query = select(VehicleTrip).where(
        VehicleTrip.device_id.in_(device_ids),
        VehicleTrip.start_time >= from_date,
        VehicleTrip.start_time <= to_date
    ).order_by(desc(VehicleTrip.start_time))
    trips_res = await db.execute(trips_query)
    trips: List[VehicleTrip] = list(trips_res.scalars().all())

    # 4. Consultar Alertas de Seguridad
    alerts_query = select(VehicleAlert).where(
        VehicleAlert.device_id.in_(device_ids),
        VehicleAlert.timestamp >= from_date,
        VehicleAlert.timestamp <= to_date
    ).order_by(desc(VehicleAlert.timestamp))
    alerts_res = await db.execute(alerts_query)
    alerts: List[VehicleAlert] = list(alerts_res.scalars().all())

    # 5. Consultar Planes de Mantenimiento Preventivo
    plans_query = select(MaintenancePlan).where(
        MaintenancePlan.device_id.in_(device_ids),
        MaintenancePlan.is_active == True
    ).order_by(MaintenancePlan.title)
    plans_res = await db.execute(plans_query)
    plans: List[MaintenancePlan] = list(plans_res.scalars().all())

    # =========================================================================
    # CÁLCULO DE KPIS Y AGREGACIONES
    # =========================================================================
    total_km_period = sum(t.distance_km or 0.0 for t in trips)
    total_trip_seconds = sum(t.duration_seconds or 0 for t in trips)
    total_trip_hours = round(total_trip_seconds / 3600.0, 1)
    total_idling_seconds = sum(t.idling_seconds or 0 for t in trips)
    total_idling_hours = round(total_idling_seconds / 3600.0, 1)
    total_idling_cost = sum(t.idling_fuel_cost_est or 0.0 for t in trips)
    max_speed_fleet = max((t.max_speed_kmh or 0.0 for t in trips), default=0.0)
    avg_speed_fleet = round(
        sum(t.avg_speed_kmh or 0.0 for t in trips) / len(trips), 1
    ) if trips else 0.0

    critical_alerts_count = sum(1 for a in alerts if a.severity == "CRITICAL")
    warning_alerts_count = sum(1 for a in alerts if a.severity == "WARNING")

    # =========================================================================
    # CONSTRUCCIÓN DEL DOCUMENTO PDF CON REPORTLAB
    # =========================================================================
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=42
    )

    styles = getSampleStyleSheet()

    # Estilos tipográficos personalizados
    style_title = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        textColor=COLOR_PRIMARY
    )
    style_subtitle = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=COLOR_ACCENT
    )
    style_meta_label = ParagraphStyle(
        "MetaLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=COLOR_TEXT_MUTED
    )
    style_meta_val = ParagraphStyle(
        "MetaVal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=COLOR_TEXT_MAIN
    )
    style_section_title = ParagraphStyle(
        "SectionTitle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=COLOR_PRIMARY,
        spaceBefore=10,
        spaceAfter=6
    )
    style_cell = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=COLOR_TEXT_MAIN
    )
    style_cell_bold = ParagraphStyle(
        "TableCellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=COLOR_PRIMARY
    )
    style_cell_center = ParagraphStyle(
        "TableCellCenter",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        alignment=TA_CENTER,
        textColor=COLOR_TEXT_MAIN
    )
    style_cell_right = ParagraphStyle(
        "TableCellRight",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        alignment=TA_RIGHT,
        textColor=COLOR_TEXT_MAIN
    )
    style_kpi_num = ParagraphStyle(
        "KpiNum",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=16,
        alignment=TA_CENTER,
        textColor=COLOR_PRIMARY
    )
    style_kpi_lbl = ParagraphStyle(
        "KpiLbl",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7,
        leading=9,
        alignment=TA_CENTER,
        textColor=COLOR_TEXT_MUTED
    )

    story = []

    # -------------------------------------------------------------------------
    # 1. ENCABEZADO CORPORATIVO
    # -------------------------------------------------------------------------
    header_data = [
        [
            Paragraph("<b>TOKIOBA TELEMATICS & IOT</b><br/><font color='#0284c7'>INFORME EJECUTIVO DE GESTIÓN Y AUDITORÍA</font>", style_title),
            Paragraph(
                f"<b>Cliente:</b> {user.name or user.email}<br/>"
                f"<b>Período:</b> {from_date.strftime('%d/%m/%Y')} al {to_date.strftime('%d/%m/%Y')}<br/>"
                f"<b>Emisión:</b> {now_utc.strftime('%d/%m/%Y %H:%M UTC')}<br/>"
                f"<b>Unidades:</b> {'Flota Completa (' + str(len(devices)) + ')' if len(devices) > 1 else devices[0].name}",
                style_meta_val
            )
        ]
    ]
    t_header = Table(header_data, colWidths=[330, 210])
    t_header.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, -1), 1.5, COLOR_PRIMARY),
    ]))
    story.append(t_header)
    story.append(Spacer(1, 10))

    # -------------------------------------------------------------------------
    # 2. SCORECARD DE KPIS PRINCIPALES
    # -------------------------------------------------------------------------
    story.append(Paragraph("Resumen Ejecutivo de Operación y Costos", style_section_title))

    idling_pct = round((total_idling_seconds / total_trip_seconds * 100), 1) if total_trip_seconds > 0 else 0.0

    kpi_data = [
        [
            Paragraph(f"{total_km_period:,.1f} km", style_kpi_num),
            Paragraph(f"{total_trip_hours:,.1f} hs", style_kpi_num),
            Paragraph(f"{total_idling_hours:,.1f} hs ({idling_pct}%)", style_kpi_num),
            Paragraph(f"$ {total_idling_cost:,.0f} ARS", style_kpi_num)
        ],
        [
            Paragraph("DISTANCIA TOTAL", style_kpi_lbl),
            Paragraph("HORAS MOTOR", style_kpi_lbl),
            Paragraph("RALENTÍ IMPRODUCTIVO", style_kpi_lbl),
            Paragraph("COSTO COMBUSTIBLE RALENTÍ", style_kpi_lbl)
        ]
    ]
    t_kpis = Table(kpi_data, colWidths=[135, 135, 135, 135])
    t_kpis.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_LIGHT),
        ('BOX', (0, 0), (-1, -1), 1, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 2),
        ('TOPPADDING', (0, 1), (-1, 1), 2),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 8),
    ]))
    story.append(t_kpis)
    story.append(Spacer(1, 12))

    # -------------------------------------------------------------------------
    # 3. TABLA DE ESTADO DE DISPOSITIVOS AUDITADOS
    # -------------------------------------------------------------------------
    story.append(Paragraph("Parque Automotor y Telemetría Consolidada", style_section_title))

    dev_table_rows = [
        [
            Paragraph("<b>Vehículo / Patente</b>", style_cell_bold),
            Paragraph("<b>Categoría</b>", style_cell_bold),
            Paragraph("<b>Odómetro Calib.</b>", style_cell_bold),
            Paragraph("<b>Horas Motor</b>", style_cell_bold),
            Paragraph("<b>Estado Inmovilizador</b>", style_cell_bold),
            Paragraph("<b>Salud Batería</b>", style_cell_bold)
        ]
    ]

    for d in devices:
        st = states_dict.get(d.device_id)
        odo_val = f"{st.calibrated_odometer_km:,.1f} km" if st and st.calibrated_odometer_km is not None else "-"
        hs_val = f"{st.engine_hours:,.1f} hs" if st and st.engine_hours is not None else "-"
        immob_status = st.immobilizer_status if st and st.immobilizer_status else "NORMAL"

        # Badge color para inmovilizador
        if immob_status == "IMMOBILIZED":
            immob_badge = "<font color='#dc2626'><b>CORTADO</b></font>"
        elif immob_status == "PENDING_CUT":
            immob_badge = "<font color='#d97706'><b>CORTE ENCOLADO</b></font>"
        else:
            immob_badge = "<font color='#16a34a'><b>HABILITADO</b></font>"

        pwr = st.external_power if st else None
        ign = bool(st.last_ignition_state) if st else False
        if pwr is not None:
            if ign and pwr < 13.2:
                bat_txt = f"{pwr:.1f}V (Alternador Débil)"
            elif not ign and pwr < 11.8:
                bat_txt = f"{pwr:.1f}V (Batería Baja)"
            else:
                bat_txt = f"{pwr:.1f}V (Normal)"
        else:
            bat_txt = "-"

        dev_table_rows.append([
            Paragraph(f"<b>{d.name}</b><br/><font color='#64748b'>{d.device_id}</font>", style_cell),
            Paragraph(d.category or "General", style_cell),
            Paragraph(odo_val, style_cell_right),
            Paragraph(hs_val, style_cell_right),
            Paragraph(immob_badge, style_cell_center),
            Paragraph(bat_txt, style_cell_center)
        ])

    t_devs = Table(dev_table_rows, colWidths=[130, 80, 85, 75, 95, 75])
    t_devs.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_SECONDARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
        ('TOPPADDING', (0, 0), (-1, 0), 4),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, COLOR_BG_LIGHT]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 1), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 4),
    ]))
    story.append(t_devs)
    story.append(Spacer(1, 12))

    # -------------------------------------------------------------------------
    # 4. TABLA DE VIAJES DESTACADOS DEL PERÍODO
    # -------------------------------------------------------------------------
    story.append(Paragraph(f"Registro Detallado de Recorridos ({len(trips)} viajes registrados)", style_section_title))

    if trips:
        trip_table_rows = [
            [
                Paragraph("<b>Vehículo</b>", style_cell_bold),
                Paragraph("<b>Inicio Viaje</b>", style_cell_bold),
                Paragraph("<b>Duración</b>", style_cell_bold),
                Paragraph("<b>Distancia</b>", style_cell_bold),
                Paragraph("<b>Vel. Máx / Prom</b>", style_cell_bold),
                Paragraph("<b>Ralentí (Desperdicio)</b>", style_cell_bold)
            ]
        ]

        # Limitar a los 25 viajes más recientes para mantener el reporte ágil
        for t in trips[:25]:
            dev_name = next((d.name for d in devices if d.device_id == t.device_id), t.device_id)
            start_str = t.start_time.strftime("%d/%m %H:%M") if t.start_time else "-"
            
            # Duración
            mins = (t.duration_seconds or 0) // 60
            hrs = mins // 60
            rem_m = mins % 60
            dur_str = f"{hrs}h {rem_m}m" if hrs > 0 else f"{mins} min"

            # Ralentí
            id_m = (t.idling_seconds or 0) // 60
            id_cost = t.idling_fuel_cost_est or 0.0
            id_str = f"{id_m}m (${id_cost:,.0f})" if id_m > 0 else "-"

            trip_table_rows.append([
                Paragraph(dev_name, style_cell),
                Paragraph(start_str, style_cell),
                Paragraph(dur_str, style_cell_center),
                Paragraph(f"{t.distance_km:.1f} km", style_cell_right),
                Paragraph(f"{t.max_speed_kmh:.0f} / {t.avg_speed_kmh:.0f} km/h", style_cell_center),
                Paragraph(id_str, style_cell_right)
            ])

        t_trips = Table(trip_table_rows, colWidths=[100, 85, 75, 75, 95, 110])
        t_trips.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_SECONDARY),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
            ('TOPPADDING', (0, 0), (-1, 0), 4),
            ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, COLOR_BG_LIGHT]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 1), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 3),
        ]))
        story.append(t_trips)
    else:
        story.append(Paragraph("<i>No se registraron viajes completados en el período seleccionado.</i>", style_cell))

    story.append(Spacer(1, 12))

    # -------------------------------------------------------------------------
    # 5. SEMÁFORO DE MANTENIMIENTO PREVENTIVO
    # -------------------------------------------------------------------------
    story.append(Paragraph("Estado del Semáforo de Mantenimiento Mecánico", style_section_title))

    if plans:
        maint_table_rows = [
            [
                Paragraph("<b>Vehículo</b>", style_cell_bold),
                Paragraph("<b>Servicio / Tarea</b>", style_cell_bold),
                Paragraph("<b>Tipo</b>", style_cell_bold),
                Paragraph("<b>Próximo Service</b>", style_cell_bold),
                Paragraph("<b>Margen Restante</b>", style_cell_bold),
                Paragraph("<b>Semáforo</b>", style_cell_bold)
            ]
        ]

        for p in plans:
            dev_name = next((d.name for d in devices if d.device_id == p.device_id), p.device_id)
            st = states_dict.get(p.device_id)
            curr_val = 0.0
            if p.service_type == "KM" and st:
                curr_val = st.calibrated_odometer_km or 0.0
            elif p.service_type == "HOURS" and st:
                curr_val = st.engine_hours or 0.0

            next_val = p.next_service_value or (p.last_service_value + p.interval_value)
            rem_val = next_val - curr_val

            # Estado del semáforo
            if p.service_type == "DATE" and p.due_date:
                now_d = now_utc.date()
                due_d = p.due_date.date()
                days_left = (due_d - now_d).days
                if days_left < 0:
                    status_lbl = "<font color='#dc2626'><b>VENCIDO</b></font>"
                elif days_left <= 7:
                    status_lbl = "<font color='#d97706'><b>PRÓXIMO</b></font>"
                else:
                    status_lbl = "<font color='#16a34a'><b>AL DÍA</b></font>"
                next_str = p.due_date.strftime("%d/%m/%Y")
                rem_str = f"{days_left} días"
            else:
                unit = "km" if p.service_type == "KM" else "hs"
                if rem_val <= 0:
                    status_lbl = "<font color='#dc2626'><b>VENCIDO</b></font>"
                elif rem_val <= (p.interval_value * 0.1):
                    status_lbl = "<font color='#d97706'><b>PRÓXIMO</b></font>"
                else:
                    status_lbl = "<font color='#16a34a'><b>AL DÍA</b></font>"
                next_str = f"{next_val:,.0f} {unit}"
                rem_str = f"{rem_val:,.0f} {unit}"

            maint_table_rows.append([
                Paragraph(dev_name, style_cell),
                Paragraph(p.title, style_cell),
                Paragraph(p.service_type, style_cell_center),
                Paragraph(next_str, style_cell_right),
                Paragraph(rem_str, style_cell_right),
                Paragraph(status_lbl, style_cell_center)
            ])

        t_maint = Table(maint_table_rows, colWidths=[105, 145, 55, 80, 80, 75])
        t_maint.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_SECONDARY),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
            ('TOPPADDING', (0, 0), (-1, 0), 4),
            ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, COLOR_BG_LIGHT]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 1), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 3),
        ]))
        story.append(t_maint)
    else:
        story.append(Paragraph("<i>No se registran planes de mantenimiento preventivo activos.</i>", style_cell))

    story.append(Spacer(1, 12))

    # -------------------------------------------------------------------------
    # 6. REGISTRO DE ALERTAS E INCIDENTES DE SEGURIDAD
    # -------------------------------------------------------------------------
    story.append(Paragraph(f"Incidentes y Alertas de Seguridad ({len(alerts)} eventos)", style_section_title))

    if alerts:
        alerts_table_rows = [
            [
                Paragraph("<b>Fecha/Hora</b>", style_cell_bold),
                Paragraph("<b>Vehículo</b>", style_cell_bold),
                Paragraph("<b>Tipo Alerta</b>", style_cell_bold),
                Paragraph("<b>Severidad</b>", style_cell_bold),
                Paragraph("<b>Detalle del Incidente</b>", style_cell_bold)
            ]
        ]

        for a in alerts[:20]: # Top 20 alertas
            dev_name = next((d.name for d in devices if d.device_id == a.device_id), a.device_id)
            time_str = a.timestamp.strftime("%d/%m %H:%M") if a.timestamp else "-"
            
            if a.severity == "CRITICAL":
                sev_badge = "<font color='#dc2626'><b>CRÍTICA</b></font>"
            elif a.severity == "WARNING":
                sev_badge = "<font color='#d97706'><b>ADVERTENCIA</b></font>"
            else:
                sev_badge = "<font color='#0284c7'><b>INFO</b></font>"

            alerts_table_rows.append([
                Paragraph(time_str, style_cell),
                Paragraph(dev_name, style_cell),
                Paragraph(f"<code>{a.alert_type}</code>", style_cell),
                Paragraph(sev_badge, style_cell_center),
                Paragraph(a.message or "-", style_cell)
            ])

        t_alerts = Table(alerts_table_rows, colWidths=[80, 100, 100, 75, 185])
        t_alerts.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLOR_SECONDARY),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
            ('TOPPADDING', (0, 0), (-1, 0), 4),
            ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, COLOR_BG_LIGHT]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 1), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 3),
        ]))
        story.append(t_alerts)
    else:
        story.append(Paragraph("<i>No se registraron incidentes ni alertas de seguridad en el período auditado.</i>", style_cell))

    # Construir documento utilizando NumberedCanvas para numeración total
    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer
