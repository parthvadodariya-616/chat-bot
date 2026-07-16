import sqlite3

DATABASE_NAME = 'chat_history.db'

def migrate_db():
    conn = sqlite3.connect(DATABASE_NAME)
    cursor = conn.cursor()
    try:
        cursor.execute('ALTER TABLE sessions ADD COLUMN user_id INTEGER')
        print("Added user_id column to sessions table.")
        cursor.execute('SELECT id FROM users LIMIT 1')
        default_user = cursor.fetchone()
        if default_user:
            default_user_id = default_user[0]
            cursor.execute('UPDATE sessions SET user_id = ? WHERE user_id IS NULL', (default_user_id,))
            print(f"Assigned user_id {default_user_id} to existing sessions.")
        conn.commit()
    except sqlite3.OperationalError as e:
        print(f"Error during migration: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_db()