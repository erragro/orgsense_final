import axios from 'axios'

export const ingestClient = axios.create({
  baseURL: import.meta.env.VITE_INGEST_API_URL ?? 'http://localhost:8000',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

export const governanceClient = axios.create({
  baseURL: import.meta.env.VITE_GOVERNANCE_API_URL ?? 'http://localhost:8001',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})
