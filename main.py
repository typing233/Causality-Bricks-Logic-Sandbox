from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
from pathlib import Path

app = FastAPI(title="Causality Bricks - 3D 积木因果逻辑平台")

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
SAVES_DIR = BASE_DIR / "saves"

SAVES_DIR.mkdir(exist_ok=True)
STATIC_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class PhysicsObject(BaseModel):
    id: str
    type: str
    position: List[float]
    rotation: List[float]
    scale: List[float]
    mass: float
    restitution: float
    friction: float
    velocity: List[float]
    angularVelocity: List[float]
    isStatic: bool
    color: str
    gravityEnabled: bool


class Rule(BaseModel):
    id: str
    triggerType: str
    sourceObjectId: Optional[str]
    targetObjectId: Optional[str]
    actionType: str
    actionValue: Optional[str]
    enabled: bool


class SceneSave(BaseModel):
    name: str
    objects: List[PhysicsObject]
    rules: List[Rule]


class ChallengeState(BaseModel):
    challengeId: str
    completed: bool
    bestTime: Optional[float]


@app.get("/", response_class=HTMLResponse)
async def get_index():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return HTMLResponse(content="<h1>欢迎使用 Causality Bricks</h1><p>请确保 static/index.html 文件存在</p>", status_code=200)


@app.get("/api/scenes")
async def list_scenes():
    scenes = []
    for f in SAVES_DIR.glob("*.json"):
        try:
            with open(f, "r") as fp:
                data = json.load(fp)
                scenes.append({
                    "name": f.stem,
                    "objectCount": len(data.get("objects", [])),
                    "ruleCount": len(data.get("rules", []))
                })
        except:
            continue
    return {"scenes": scenes}


@app.get("/api/scenes/{name}")
async def get_scene(name: str):
    scene_path = SAVES_DIR / f"{name}.json"
    if not scene_path.exists():
        raise HTTPException(status_code=404, detail="场景不存在")
    with open(scene_path, "r") as fp:
        return json.load(fp)


@app.post("/api/scenes/{name}")
async def save_scene(name: str, scene: SceneSave):
    scene_path = SAVES_DIR / f"{name}.json"
    with open(scene_path, "w") as fp:
        json.dump(scene.model_dump(), fp, indent=2)
    return {"success": True, "message": f"场景 '{name}' 已保存"}


@app.delete("/api/scenes/{name}")
async def delete_scene(name: str):
    scene_path = SAVES_DIR / f"{name}.json"
    if not scene_path.exists():
        raise HTTPException(status_code=404, detail="场景不存在")
    scene_path.unlink()
    return {"success": True, "message": f"场景 '{name}' 已删除"}


@app.get("/api/challenges")
async def get_challenges():
    challenges = [
        {
            "id": "hover_ball",
            "name": "悬浮小球",
            "description": "让小球在不接触地面的情况下悬停 5 秒",
            "difficulty": "简单",
            "objective": {
                "type": "hover",
                "duration": 5.0,
                "objectType": "sphere"
            }
        },
        {
            "id": "chain_reaction",
            "name": "连锁反应",
            "description": "创建一个多米诺骨牌式的连锁反应，触发至少 5 个物体",
            "difficulty": "中等",
            "objective": {
                "type": "chain_reaction",
                "minObjects": 5
            }
        },
        {
            "id": "perfect_landing",
            "name": "完美着陆",
            "description": "让球体从高处落下，精确落在指定平台上",
            "difficulty": "中等",
            "objective": {
                "type": "landing",
                "tolerance": 0.5
            }
        }
    ]
    return {"challenges": challenges}


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    from fastapi.responses import Response
    return Response(status_code=204)


@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Causality Bricks 服务运行中"}


if __name__ == "__main__":
    import uvicorn
    print("启动 Causality Bricks 服务...")
    print(f"服务地址: http://localhost:8234")
    uvicorn.run(app, host="0.0.0.0", port=8234)
