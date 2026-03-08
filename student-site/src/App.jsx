import { useRef, useState } from 'react'
import axios from 'axios'
import { Navigate, Route, Routes } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const initialFormState = {
  rollNo: '',
  name: '',
  year: '',
  branch: '',
  section: '',
  phone: '',
}

function RegisterPage() {
  const [formData, setFormData] = useState(initialFormState)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [hasSignature, setHasSignature] = useState(false)
  const [qrRollNo, setQrRollNo] = useState('')
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)

  const updateField = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const getCoordinates = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  const startDrawing = (event) => {
    event.preventDefault()
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    const { x, y } = getCoordinates(event)

    context.beginPath()
    context.moveTo(x, y)
    context.lineWidth = 2.5
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#0f172a'

    drawingRef.current = true
    setHasSignature(true)
  }

  const draw = (event) => {
    if (!drawingRef.current) {
      return
    }

    event.preventDefault()
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')
    const { x, y } = getCoordinates(event)

    context.lineTo(x, y)
    context.stroke()
  }

  const endDrawing = () => {
    if (!drawingRef.current) {
      return
    }

    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    context.closePath()
    drawingRef.current = false
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    context.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage({ type: '', text: '' })

    if (!hasSignature) {
      setMessage({ type: 'error', text: 'Digital signature is required' })
      return
    }

    try {
      setIsSubmitting(true)
      const submittedRollNo = formData.rollNo.trim().toUpperCase()

      const payload = {
        ...formData,
        rollNo: submittedRollNo,
        year: Number(formData.year),
        signature: canvasRef.current.toDataURL('image/png'),
      }

      await axios.post(`${API_BASE_URL}/student/register`, payload)

      setMessage({ type: 'success', text: 'Student registered successfully' })
      setQrRollNo(submittedRollNo)
      setFormData(initialFormState)
      clearSignature()
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to register student'
      setMessage({ type: 'error', text: errorMessage })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="register-page">
      <section className="register-card">
        <h1>Student Registration</h1>
        <p className="subtext">Fill in details and add your digital signature.</p>

        <form onSubmit={handleSubmit} className="register-form">
          <label>
            Roll No
            <input name="rollNo" value={formData.rollNo} onChange={updateField} required />
          </label>

          <label>
            Name
            <input name="name" value={formData.name} onChange={updateField} required />
          </label>

          <label>
            Year
            <input
              type="number"
              min="1"
              max="5"
              name="year"
              value={formData.year}
              onChange={updateField}
              required
            />
          </label>

          <label>
            Branch
            <input name="branch" value={formData.branch} onChange={updateField} required />
          </label>

          <label>
            Section
            <input name="section" value={formData.section} onChange={updateField} required />
          </label>

          <label>
            Phone
            <input name="phone" value={formData.phone} onChange={updateField} required />
          </label>

          <div className="signature-wrap">
            <div className="signature-header">
              <span>Digital Signature</span>
              <button type="button" className="clear-btn" onClick={clearSignature}>
                Clear
              </button>
            </div>
            <canvas
              ref={canvasRef}
              className="signature-canvas"
              width={700}
              height={220}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={endDrawing}
              onPointerLeave={endDrawing}
            />
          </div>

          {message.text ? (
            <p className={`status ${message.type === 'error' ? 'error' : 'success'}`}>
              {message.text}
            </p>
          ) : null}

          <button type="submit" className="submit-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </form>

        {qrRollNo ? (
          <div className="qr-result">
            <h2>Registration QR</h2>
            <p>
              Roll No: <strong>{qrRollNo}</strong>
            </p>
            <div className="qr-box">
              <QRCodeSVG value={qrRollNo} size={180} includeMargin />
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="*" element={<Navigate to="/register" replace />} />
    </Routes>
  )
}

export default App
