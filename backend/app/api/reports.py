"""
Endpoints para Generación y Descarga de Reportes Ejecutivos (Sprint 2 - plan_v4.md - v0.6.0)
Rutas:
- GET /api/reports/executive/pdf (Descarga de PDF Corporativo con KPIs, Viajes, Alertas y Mantenimiento)
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.models import User
from app.api.deps import get_current_user
from app.services.report_generator import generate_executive_pdf_report

logger = logging.getLogger("reports_api")
router = APIRouter()


@router.get("/executive/pdf")
async def download_executive_pdf_report(
    device_id: Optional[str] = Query(None, description="ID del vehículo específico o 'all' para flota completa"),
    from_date: Optional[datetime] = Query(None, description="Fecha de inicio (ISO format)"),
    to_date: Optional[datetime] = Query(None, description="Fecha de fin (ISO format)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Genera y descarga en tiempo real el Reporte Ejecutivo en formato PDF Corporativo Tokioba.
    Incluye:
    - Scorecard de KPIs de operación y costos en pesos de ralentí.
    - Tabla consolidada de parque automotor y odómetros calibrados.
    - Resumen detallado de viajes y velocidades alcanzadas.
    - Semáforo de mantenimiento preventivo (Al Día, Próximo, Vencido).
    - Registro de incidentes y alertas de seguridad.
    """
    try:
        pdf_stream = await generate_executive_pdf_report(
            db=db,
            user=current_user,
            device_id=device_id,
            from_date=from_date,
            to_date=to_date
        )

        now_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        target_name = f"vehiculo_{device_id}" if device_id and device_id.lower() != "all" else "flota_consolidada"
        filename = f"reporte_ejecutivo_{target_name}_{now_str}.pdf"

        return StreamingResponse(
            pdf_stream,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=\"{filename}\"",
                "Content-Type": "application/pdf"
            }
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(ve)
        )
    except RuntimeError as re:
        logger.warning(f"[REPORTS API] Servicio no disponible: {re}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(re)
        )
    except Exception as e:
        logger.error(f"[REPORTS API] Error generando reporte PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error interno generando el reporte PDF: {str(e)}"
        )
