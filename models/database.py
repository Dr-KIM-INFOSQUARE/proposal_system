from sqlalchemy import create_engine, Column, Integer, String, JSON, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./planweaver.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

import datetime

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
