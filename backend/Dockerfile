FROM python:3.12-slim
WORKDIR /app

# gcc needed by some Python packages with C extensions. Create a non-root app
# user in the same layer so we don't carry over root-owned files; the
# --chown flags on subsequent COPY commands make the app user the file owner.
RUN apt-get update && apt-get install -y --no-install-recommends gcc \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --shell /usr/sbin/nologin --uid 1000 app

COPY --chown=app:app requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=app:app . /app

RUN chmod +x /app/entrypoint.sh

ENV FLASK_APP=app.py

EXPOSE 5000

# Drop privileges before running the app. Gunicorn doesn't need root to bind
# to port 5000 (only ports <1024 do), and Flask migrations only need DB
# access, not local filesystem writes.
USER app

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "--workers", "2", "--bind", "0.0.0.0:5000", "app:app"]
