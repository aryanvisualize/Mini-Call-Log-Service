CREATE TABLE calls (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    duration INTEGER NOT NULL
);

CREATE TABLE transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT NOT NULL,
    speaker TEXT NOT NULL,
    text TEXT NOT NULL
);

CREATE TABLE call_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT NOT NULL,
    stt_latency REAL,
    llm_latency REAL,
    tts_latency REAL
);