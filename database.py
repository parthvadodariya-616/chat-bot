import sqlite3
import uuid
from werkzeug.security import generate_password_hash, check_password_hash

DATABASE_NAME = 'chat_history.db'

def init_db():
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            user_message TEXT,
            bot_response TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
    ''')
    conn.commit()
    conn.close()

def add_user(name, email, password):
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute(
            'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
            (name, email, generate_password_hash(password))
        )
        conn.commit()
        user_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        user_id = None  # Email already exists
    finally:
        conn.close()
    return user_id

def get_user_by_email(email):
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
    user_data = cursor.fetchone()
    conn.close()
    if user_data:
        return {'id': user_data[0], 'name': user_data[1], 'email': user_data[2], 'password_hash': user_data[3]}
    return None

def get_user_by_id(user_id):
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute('SELECT id, name, email FROM users WHERE id = ?', (user_id,))
    user_data = cursor.fetchone()
    conn.close()
    if user_data:
        return {'id': user_data[0], 'name': user_data[1], 'email': user_data[2]}
    return None

def create_new_session(user_id):
    session_id = str(uuid.uuid4())
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute('INSERT INTO sessions (id, user_id) VALUES (?, ?)', (session_id, user_id))
    conn.commit()
    conn.close()
    return session_id

def get_sessions(user_id):
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute('''
        SELECT s.id, (SELECT m.user_message FROM messages m WHERE m.session_id = s.id ORDER BY m.created_at ASC LIMIT 1) as title
        FROM sessions s
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC
    ''', (user_id,))
    sessions = [{'id': row[0], 'title': row[1] if row[1] else 'New Chat'} for row in cursor.fetchall()]
    conn.close()
    return sessions

def get_conversation_by_session_id(session_id, user_id):
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute(
        'SELECT m.user_message, m.bot_response FROM messages m JOIN sessions s ON m.session_id = s.id WHERE m.session_id = ? AND s.user_id = ? ORDER BY m.created_at ASC',
        (session_id, user_id)
    )
    messages = [{'user': row[0], 'bot': row[1]} for row in cursor.fetchall()]
    conn.close()
    return messages

def delete_session_by_id(session_id, user_id):
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute('SELECT id FROM sessions WHERE id = ? AND user_id = ?', (session_id, user_id))
    session_to_delete = cursor.fetchone()
    if session_to_delete:
        cursor.execute('DELETE FROM messages WHERE session_id = ?', (session_id,))
        cursor.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
        conn.commit()
    conn.close()

def add_message(session_id, user_message, bot_response):
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO messages (session_id, user_message, bot_response) VALUES (?, ?, ?)',
        (session_id, user_message, bot_response)
    )
    conn.commit()
    conn.close()