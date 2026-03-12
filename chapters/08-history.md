# 第 8 章　SQLite 历史追踪系统

## 8.1 为什么需要历史记录

向量库存储的是**当前状态**：Alice 的记忆现在是"练瑜伽"。但我们可能需要知道：
- 她以前喜欢什么？
- 这条记忆什么时候改变的？
- 是哪个 Agent 更改的？

`SQLiteManager` 就是 mem0 的**变更审计日志**，记录每条记忆从诞生到消亡的完整历史。

## 8.2 SQLiteManager 架构

```python
class SQLiteManager:
    def __init__(self, db_path: str = ":memory:"):
        self.db_path = db_path
        self.connection = sqlite3.connect(db_path, check_same_thread=False)
        self._lock = threading.Lock()      # ← 线程安全
        self._migrate_history_table()      # ← schema 迁移
        self._create_history_table()       # ← 建表（幂等）
```

三个关键设计：
1. **默认内存模式**（`:memory:`）：单元测试不产生文件
2. **生产模式**：`~/.mem0/history.db`（来自 MemoryConfig.history_db_path）
3. **线程锁**：所有写操作都加锁，保证并发安全

## 8.3 history 表结构

```sql
CREATE TABLE IF NOT EXISTS history (
    id           TEXT PRIMARY KEY,   -- 事件 UUID（每次操作生成）
    memory_id    TEXT,               -- 对应向量库中的记忆 UUID
    old_memory   TEXT,               -- 操作前的文本（ADD 时为 NULL）
    new_memory   TEXT,               -- 操作后的文本（DELETE 时为 NULL）
    event        TEXT,               -- ADD / UPDATE / DELETE
    created_at   DATETIME,           -- 记忆创建时间
    updated_at   DATETIME,           -- 本次操作时间
    is_deleted   INTEGER,            -- 软删除标志（0/1）
    actor_id     TEXT,               -- 操作者 ID（多参与方场景）
    role         TEXT                -- 消息角色（user/assistant）
)
```

`memory_id` 和 `id` 的区别：
- `memory_id`：向量库中记忆的稳定 UUID，一条记忆只有一个
- `id`：历史事件的 UUID，同一条记忆可以有多条历史记录

## 8.4 典型历史记录示例

一条记忆从创建到删除的完整历史：

```sql
SELECT id, event, old_memory, new_memory, updated_at
FROM history
WHERE memory_id = 'abc-123'
ORDER BY updated_at;
```

```
id=e1  | ADD    | null              | "喜欢跑步"          | 2026-01-01 08:00
id=e2  | UPDATE | "喜欢跑步"         | "喜欢跑步和瑜伽"     | 2026-02-15 10:00
id=e3  | UPDATE | "喜欢跑步和瑜伽"   | "只练瑜伽了"         | 2026-03-01 09:00
id=e4  | DELETE | "只练瑜伽了"       | null                | 2026-03-12 14:00
```

这就是一条记忆的完整生命周期。

## 8.5 add_history()：写入历史

```python
def add_history(
    self,
    memory_id: str,
    old_memory: Optional[str],
    new_memory: Optional[str],
    event: str,
    *,
    created_at: Optional[str] = None,
    updated_at: Optional[str] = None,
    is_deleted: int = 0,
    actor_id: Optional[str] = None,
    role: Optional[str] = None,
) -> None:
    with self._lock:
        try:
            self.connection.execute("BEGIN")
            self.connection.execute(
                """INSERT INTO history (id, memory_id, old_memory, new_memory,
                   event, created_at, updated_at, is_deleted, actor_id, role)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), memory_id, old_memory, new_memory,
                 event, created_at, updated_at, is_deleted, actor_id, role),
            )
            self.connection.execute("COMMIT")
        except Exception as e:
            self.connection.execute("ROLLBACK")
            raise
```

每次调用 `_create_memory()`、`_update_memory()`、`_delete_memory()` 都会触发一次 `add_history()`。

## 8.6 get_history()：查询历史

```python
def get_history(self, memory_id: str) -> List[Dict]:
    with self._lock:
        cur = self.connection.execute(
            """SELECT id, memory_id, old_memory, new_memory, event,
                      created_at, updated_at, is_deleted, actor_id, role
               FROM history
               WHERE memory_id = ?
               ORDER BY created_at ASC, DATETIME(updated_at) ASC""",
            (memory_id,),
        )
        rows = cur.fetchall()

    return [
        {
            "id": r[0],
            "memory_id": r[1],
            "old_memory": r[2],
            "new_memory": r[3],
            "event": r[4],
            "created_at": r[5],
            "updated_at": r[6],
            "is_deleted": bool(r[7]),
            "actor_id": r[8],
            "role": r[9],
        }
        for r in rows
    ]
```

查询时**读操作不加锁**（SQLite 支持并发读）。结果按时间升序排列，方便追溯变更历史。

## 8.7 Memory.history()：用户接口

```python
# 用户层面的 API
history = m.history("abc-123-memory-id")
```

内部调用：

```python
def history(self, memory_id: str):
    return self.db.get_history(memory_id)
```

实际使用：

```python
# 找到记忆
memories = m.get_all(user_id="alice")
memory_id = memories["results"][0]["id"]

# 查看历史
history = m.history(memory_id)
for event in history:
    print(f"{event['event']}: {event['old_memory']} → {event['new_memory']}")

# 输出:
# ADD: None → 喜欢跑步
# UPDATE: 喜欢跑步 → 喜欢跑步和瑜伽
# DELETE: 喜欢跑步和瑜伽 → None
```

## 8.8 Schema 迁移机制

v1.0 重构了 history 表结构（移除了旧的群聊字段）。`_migrate_history_table()` 确保已有用户升级时数据不丢失：

```python
def _migrate_history_table(self) -> None:
    with self._lock:
        try:
            self.connection.execute("BEGIN")
            cur = self.connection.cursor()

            # 检查表是否存在
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='history'")
            if cur.fetchone() is None:
                self.connection.execute("COMMIT")
                return  # 新安装，不需要迁移

            # 检查当前 schema 是否已是新版本
            cur.execute("PRAGMA table_info(history)")
            old_cols = {row[1] for row in cur.fetchall()}

            expected_cols = {"id", "memory_id", "old_memory", "new_memory", "event",
                             "created_at", "updated_at", "is_deleted", "actor_id", "role"}

            if old_cols == expected_cols:
                self.connection.execute("COMMIT")
                return  # 已是新版本，无需迁移

            # 执行迁移：备份旧表 → 建新表 → 复制数据 → 删旧表
            cur.execute("DROP TABLE IF EXISTS history_old")
            cur.execute("ALTER TABLE history RENAME TO history_old")

            # 建新表（见 _create_history_table）
            # 只复制新旧表都有的列（交集）
            intersecting = list(expected_cols & old_cols)
            cols_csv = ", ".join(intersecting)
            cur.execute(f"INSERT INTO history ({cols_csv}) SELECT {cols_csv} FROM history_old")

            cur.execute("DROP TABLE history_old")
            self.connection.execute("COMMIT")

        except Exception as e:
            self.connection.execute("ROLLBACK")
            raise
```

迁移步骤：
1. 检查表是否存在
2. 检查 schema 是否需要迁移（列集合对比）
3. 备份旧表为 `history_old`
4. 创建新表
5. 只复制交集列（新增列用默认值）
6. 删除旧表
7. 任何错误都 ROLLBACK

这种"拷贝迁移"方式比 `ALTER TABLE ADD COLUMN` 更彻底，支持列的增删重命名。

## 8.9 线程安全设计

mem0 的 `add()` 使用 `ThreadPoolExecutor` 并发执行向量写入和图写入。在向量写入管线中，每个记忆操作（create/update/delete）都会触发 `add_history()`。

`SQLiteManager` 的线程安全依赖于：
1. **显式加锁**：`self._lock = threading.Lock()`
2. **每次操作独立事务**：BEGIN/COMMIT/ROLLBACK
3. **连接共享**：`check_same_thread=False`，允许多线程使用同一连接

注意：SQLite 的 WAL 模式可以提高并发性能，但 mem0 默认未启用，因为写操作频率通常不高。

## 8.10 reset()：清空历史

```python
def reset(self) -> None:
    """清空并重建历史表（通常用于测试）"""
    with self._lock:
        try:
            self.connection.execute("BEGIN")
            self.connection.execute("DROP TABLE IF EXISTS history")
            self.connection.execute("COMMIT")
            self._create_history_table()
        except Exception as e:
            self.connection.execute("ROLLBACK")
            raise
```

## 8.11 小结

SQLite 历史系统的设计优雅而实用：

| 特性 | 实现方式 |
|------|----------|
| 变更审计 | 每次 create/update/delete 都写一条历史 |
| 线程安全 | threading.Lock + 显式事务 |
| Schema 演进 | 拷贝迁移，零数据丢失 |
| 轻量级 | 纯 SQLite，无额外依赖 |
| 可追溯 | old_memory + new_memory 双字段 |

向量库管"现在"，SQLite 管"历史"——两者配合，构成 mem0 的完整记忆管理体系。

下一章，我们进入向量存储生态，解析 mem0 支持 20+ 向量数据库的抽象层设计。
