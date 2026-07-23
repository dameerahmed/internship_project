import re

file_path = r'd:\internship\backend\app\routers\logs.py'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add jsonable_encoder
if 'from fastapi.encoders import jsonable_encoder' not in content:
    content = content.replace(
        'from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query, HTTPException',
        'from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query, HTTPException\nfrom fastapi.encoders import jsonable_encoder'
    )

# Fix websocket.send_json
content = content.replace('await websocket.send_json(payload)', 'await websocket.send_json(jsonable_encoder(payload))')
content = content.replace('await websocket.send_json({', 'await websocket.send_json(jsonable_encoder({')
content = content.replace('})\n                    last_hash = current_hash', '}))\n                    last_hash = current_hash')

# Let's completely replace the old websocket_dashboard_stream
ws_pattern = re.compile(r'@router\.websocket\("/ws/dashboard/\{company_id\}"\)\nasync def websocket_dashboard_stream.*?@router\.get\("/v1/dashboard/stats"\)', re.DOTALL)

new_ws_stream = '''@router.websocket("/ws/dashboard/{company_id}")
async def websocket_dashboard_stream(websocket: WebSocket, company_id: str):
    await websocket.accept()
    try:
        c_id = int(company_id) if company_id and company_id.isdigit() else None
        last_payload_hash = ""

        while True:
            if websocket.client_state != WebSocketState.CONNECTED:
                break
                
            try:
                # -- Infrastructure health --
                redis_status = "ONLINE"
                redis_latency_ms = 0.0
                try:
                    t0 = time.perf_counter()
                    r_client = await get_redis_client()
                    pong = await r_client.ping()
                    await r_client.close()
                    t1 = time.perf_counter()
                    if pong:
                        redis_latency_ms = round((t1 - t0) * 1000, 2)
                except Exception:
                    redis_status = "DEGRADED"

                rabbitmq_status = "ONLINE"
                try:
                    rmq_ok = await service_health_monitor.check_rabbitmq()
                    rabbitmq_status = "ONLINE" if rmq_ok else "DEGRADED"
                except Exception:
                    pass

                # -- Real Queue counts --
                dlq_count = await rabbitmq_manager.get_dlq_message_count()
                main_queue_count = await rabbitmq_manager.get_main_queue_message_count()

                # -- DB Metadata (Projects/Routes) --
                async for db_session in get_db():
                    proj_res = await db_session.execute(select(Project).where(Project.company_id == c_id))
                    projects = proj_res.scalars().all()
                    active_projects = sum(1 for p in projects if p.is_active)
                    project_ids = [p.id for p in projects]

                    total_routes = 0
                    if project_ids:
                        ec_res = await db_session.execute(
                            select(func.count(EventConfig.id)).where(EventConfig.project_id.in_(project_ids), EventConfig.is_active == True)
                        )
                        total_routes = ec_res.scalar() or 0

                    # -- Fetch Redis Metrics --
                    metrics = await metrics_service.get_or_hydrate_metrics(c_id, db_session)
                    
                    payload = {
                        "type": "DASHBOARD_UPDATE",
                        "total_projects": len(projects),
                        "active_projects": active_projects,
                        "total_event_routes": total_routes,
                        "total_webhooks": metrics["total_webhooks"],
                        "throughput_rpm": metrics["throughput_rpm"],
                        "throughput_rps": metrics["throughput_rps"],
                        "success_count": metrics["success_count"],
                        "failed_count": metrics["failed_count"],
                        "success_rate": metrics["success_rate"],
                        "avg_latency_ms": metrics["avg_latency_ms"],
                        "dlq_count": dlq_count,
                        "main_queue_count": main_queue_count,
                        "redis_status": redis_status,
                        "redis_latency_ms": redis_latency_ms,
                        "rabbitmq_status": rabbitmq_status,
                    }
                    break  # exit db generator
                    
                if websocket.client_state != WebSocketState.CONNECTED:
                    break

                current_hash = json.dumps(jsonable_encoder(payload), sort_keys=True)
                if current_hash != last_payload_hash:
                    await websocket.send_json(jsonable_encoder(payload))
                    last_payload_hash = current_hash

            except Exception as inner_exc:
                err_str = str(inner_exc)
                if "Cannot call" in err_str or "ConnectionClosed" in err_str or "RuntimeError" in err_str:
                    break
                
            await asyncio.sleep(1.0)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        pass


@router.get("/v1/dashboard/stats")'''

content = ws_pattern.sub(new_ws_stream, content)


get_stats_pattern = re.compile(r'@router\.get\("/v1/dashboard/stats"\)\nasync def get_dashboard_stats.*?@router\.get\("/v1/dlq"\)', re.DOTALL)

new_get_stats = '''@router.get("/v1/dashboard/stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_company = Depends(get_current_company)
):
    company_id = current_company.id

    redis_status = "ONLINE"
    redis_latency_ms = 0.5
    try:
        t0 = time.perf_counter()
        r_client = await get_redis_client()
        pong = await r_client.ping()
        await r_client.close()
        t1 = time.perf_counter()
        if pong:
            redis_status = "ONLINE"
            redis_latency_ms = round((t1 - t0) * 1000, 2)
    except Exception as exc:
        redis_status = "DEGRADED"

    rabbitmq_status = "ONLINE"
    try:
        rmq_ok = await service_health_monitor.check_rabbitmq()
        rabbitmq_status = "ONLINE" if rmq_ok else "DEGRADED"
    except Exception:
        pass

    real_dlq_count = await rabbitmq_manager.get_dlq_message_count()
    real_main_queue_count = await rabbitmq_manager.get_main_queue_message_count()

    proj_result = await db.execute(select(Project).where(Project.company_id == company_id))
    projects = proj_result.scalars().all()
    project_ids = [p.id for p in projects]
    active_projects = sum(1 for p in projects if p.is_active)

    total_routes = 0
    if project_ids:
        ec_result = await db.execute(
            select(func.count(EventConfig.id)).where(EventConfig.project_id.in_(project_ids), EventConfig.is_active == True)
        )
        total_routes = ec_result.scalar() or 0

    metrics = await metrics_service.get_or_hydrate_metrics(company_id, db)

    return {
        "total_projects": len(projects),
        "active_projects": active_projects,
        "total_event_routes": total_routes,
        "total_webhooks": metrics["total_webhooks"],
        "throughput_rpm": metrics["throughput_rpm"],
        "throughput_rps": metrics["throughput_rps"],
        "success_count": metrics["success_count"],
        "failed_count": metrics["failed_count"],
        "success_rate": metrics["success_rate"],
        "avg_latency_ms": metrics["avg_latency_ms"],
        "dlq_count": real_dlq_count,
        "main_queue_count": real_main_queue_count,
        "redis_status": redis_status,
        "redis_latency_ms": redis_latency_ms,
        "rabbitmq_status": rabbitmq_status,
        "stats_window": "lifetime",
    }


@router.get("/v1/dlq")'''

content = get_stats_pattern.sub(new_get_stats, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("done")
