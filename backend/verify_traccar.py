import asyncio
from app.db import AsyncSessionLocal
from app.models.models import Device, DeviceState, TelemetryEvent
from sqlalchemy.future import select

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(DeviceState).where(DeviceState.device_id == 'ATC700_01'))
        ds = res.scalars().first()
        if ds:
            print(f"DeviceState found: lat={ds.last_latitude}, lon={ds.last_longitude}, speed={ds.last_speed}, updated={ds.last_updated}")
        else:
            print("DeviceState not found for ATC700_01")
            
        ev_res = await db.execute(
            select(TelemetryEvent)
            .where(TelemetryEvent.device_id == 'ATC700_01')
            .order_by(TelemetryEvent.id.desc())
            .limit(5)
        )
        events = ev_res.scalars().all()
        print(f"Total retrieved events: {len(events)}")
        for ev in events:
            print(f"Event #{ev.id}: time={ev.timestamp}, lat={ev.latitude}, lon={ev.longitude}, speed={ev.speed}, raw_data={ev.raw_data is not None}")
            if ev.raw_data:
                print(f"  Sample raw_data keys: {list(ev.raw_data.keys())}")
                print(f"  Attributes: {ev.raw_data.get('attributes')}")

if __name__ == "__main__":
    asyncio.run(main())
