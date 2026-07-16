from flask import Flask, render_template, request, jsonify, Response, redirect, url_for, session, flash
from werkzeug.security import check_password_hash
import uuid
import json
from functools import wraps
import os
import google.generativeai as genai
import database

app = Flask(__name__)
app.config['SECRET_KEY'] = str(uuid.uuid4())  # Generate random UUID as secret key

# --- Initialize Gemini Model ---
API_KEY = os.getenv("GOOGLE_AI_API_KEY")
MODEL_NAME = "gemini-1.5-flash-latest"

try:
    if not API_KEY:
        print("Warning: Google AI API key is not configured.")
        model = None
    else:
        genai.configure(api_key=API_KEY)
        model = genai.GenerativeModel(MODEL_NAME)
except Exception as e:
    print(f"Error initializing Gemini model: {e}")
    model = None

# --- Decorator for requiring login ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# --- Authentication Routes ---
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get('email')
        password = request.form.get('password')
        user = database.get_user_by_email(email)

        if user and check_password_hash(user['password_hash'], password):
            session['user_id'] = user['id']
            session['user_name'] = user['name']
            return redirect(url_for('chat_index'))  # Redirect to main page
        else:
            flash("Invalid email or password.", "error")
            return render_template("login.html")
    return render_template("login.html")

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        name = request.form.get('name')
        email = request.form.get('email')
        password = request.form.get('password')
        
        user_id = database.add_user(name, email, password)
        if user_id:
            session['user_id'] = user_id
            session['user_name'] = name
            return redirect(url_for('chat_index'))  # Redirect to main page
        else:
            flash("Email address already in use.", "error")
            return render_template("signup.html")
    return render_template("signup.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route("/profile")
@login_required
def profile():
    user_id = session['user_id']
    user_info = database.get_user_by_id(user_id)
    chat_sessions = database.get_sessions(user_id)
    return render_template("profile.html", user=user_info, chats=chat_sessions)

# --- Main Chat Application Routes ---
@app.route("/")
@login_required
def chat_index():
    session_id = request.args.get('session_id')
    if session_id:
        # Load specific chat session
        messages = database.get_conversation_by_session_id(session_id, session['user_id'])
        if messages is None:
            flash("Conversation not found or access denied.", "error")
    return render_template("index.html", session_id=session_id)

@app.route("/chat", methods=["POST"])
@login_required
def chat_stream():
    data = request.get_json()
    user_message = data.get("message")
    
    def get_bot_response_stream(message):
        if model is None:
            yield "data: " + json.dumps({"error": "Chat functionality disabled (no AI model available)."}) + "\n\n"
            return
        try:
            stream = model.generate_content(message, stream=True)
            for chunk in stream:
                if chunk.text:
                    yield "data: " + json.dumps({"text": chunk.text}) + "\n\n"
        except Exception as e:
            print(f"API Error: {e}")
            yield "data: " + json.dumps({"error": "AI service error."}) + "\n\n"
    
    return Response(get_bot_response_stream(user_message), mimetype='text/event-stream')

@app.route("/save_chat", methods=["POST"])
@login_required
def save_chat():
    data = request.get_json()
    database.add_message(data["session_id"], data["user_message"], data["bot_response"])
    return jsonify({"success": True})

@app.route("/new_chat", methods=["POST"])
@login_required
def new_chat():
    session_id = database.create_new_session(session['user_id'])
    return jsonify({"session_id": session_id})

@app.route("/history", methods=["GET"])
@login_required
def get_history_list():
    sessions = database.get_sessions(session['user_id'])
    return jsonify(sessions)

@app.route("/history/<session_id>", methods=["GET"])
@login_required
def get_conversation(session_id):
    messages = database.get_conversation_by_session_id(session_id, session['user_id'])
    if messages is None:
        return jsonify({"error": "Conversation not found or access denied"}), 404
    return jsonify({"session_id": session_id, "messages": messages})

@app.route("/history/<session_id>", methods=["DELETE"])
@login_required
def delete_history(session_id):
    database.delete_session_by_id(session_id, session['user_id'])
    return jsonify({"success": True, "message": "Session deleted"}), 200

# --- Main Execution ---
if __name__ == "__main__":
    database.init_db()
    app.run(debug=True)