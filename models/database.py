from sqlalchemy import create_engine, Column, Integer, String, JSON, DateTime, event
from sqlalchemy.orm import declarative_base, sessionmaker
from pathlib import Path
import datetime

# DB 파일을 data/ 폴더에서 관리 (루트 폴더 오염 방지)
_DB_DIR = Path(__file__).parent.parent / "data"
_DB_DIR.mkdir(exist_ok=True)  # 폴더가 없으면 자동 생성

SQLALCHEMY_DATABASE_URL = f"sqlite:///{_DB_DIR / 'planweaver.db'}"

# 타임아웃을 30초로 설정하여 혼잡 시 대기 시간을 늘림
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False, "timeout": 30}
)

# 동시성 문제(Database is locked)를 해결하기 위해 WAL(Write-Ahead Logging) 모드 강제 적용
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000") # 30초
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_kst_time():
    """한국 표준시(KST) 시간을 반환합니다."""
    return datetime.datetime.utcnow() + datetime.timedelta(hours=9)

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(String, unique=True, index=True)
    name = Column(String, default="Untitled Project") # 사용자 정의 프로젝트 명
    filename = Column(String, default="Unknown Document") # 원본 파일 명
    created_at = Column(DateTime, default=get_kst_time)
    selected_node_ids = Column(JSON, default=list)
    content_node_ids = Column(JSON, default=list)
    parsed_tree = Column(JSON, default=list)
    master_brief = Column(String, nullable=True) # 아이디어 고도화 결과 저장 (Master Brief)
    initial_idea = Column(String, nullable=True) # 자유입력/가이드입력 탭 상태 보존
    notebook_id = Column(String, nullable=True) # 생성된 NotebookLM ID 기록
    research_mode = Column(String, nullable=True) # 마지막 성공한 리서치 모드 (fast/deep)
    persona_injected = Column(Integer, default=0) # 페르소나/글로벌 규칙 주입 여부 (0: No, 1: Yes)

class UsageLog(Base):
    __tablename__ = "usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(String, index=True)
    model_id = Column(String)
    task_type = Column(String, default="analysis") # 'analysis' or 'idea_enhance'
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    estimated_cost = Column(JSON) # {"usd": 0.0, "reason": "desc"}
    created_at = Column(DateTime, default=get_kst_time)

# DB 테이블 생성
Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
