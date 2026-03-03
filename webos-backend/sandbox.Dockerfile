FROM python:3.12-slim

RUN pip install --no-cache-dir \
    pandas \
    openpyxl \
    xlsxwriter \
    numpy \
    matplotlib \
    chardet \
    requests

WORKDIR /workspace
