import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import axios from 'axios'
import { Html5QrcodeScanner } from 'html5-qrcode'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const roleOf = (value) => String(value || '').trim().toUpperCase()
const errorMessage = (error, fallback) => error?.response?.data?.message || fallback
const uniqueIds = (values) => [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))]

const driveKey = (drive) => {
  const nameKey = String(drive?.driveName || '').trim().toLowerCase()
  const date = new Date(drive?.date)
  const dateKey = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
  return `${nameKey}|${dateKey}`
}

const dedupeByKey = (items, keyGetter) => {
  const seen = new Set()
  return (items || []).filter((item) => {
    const key = keyGetter(item)
    if (!key || seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

const dedupeDrives = (items) => dedupeByKey(items, driveKey)
const dedupeCoordinators = (items) => dedupeByKey(items, (item) => String(item?.email || item?._id || '').trim().toLowerCase())
const noticeClass = (type) => (type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success')

const parseUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}')
  } catch {
    return {}
  }
}

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function IconBase({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

function DashboardIcon() {
  return (
    <IconBase>
      <rect x="3" y="3" width="8" height="8" />
      <rect x="13" y="3" width="8" height="5" />
      <rect x="13" y="10" width="8" height="11" />
      <rect x="3" y="13" width="8" height="8" />
    </IconBase>
  )
}

function DrivesIcon() {
  return (
    <IconBase>
      <path d="M3 7h18v11H3z" />
      <path d="M9 7V5h6v2" />
      <path d="M3 12h18" />
    </IconBase>
  )
}

function AttendanceIcon() {
  return (
    <IconBase>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
      <path d="M14 14h2v2h-2zM18 14h2v6h-6v-2h4z" />
    </IconBase>
  )
}

function CoordinatorsIcon() {
  return (
    <IconBase>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3.5 19a4.5 4.5 0 0 1 9 0" />
      <path d="M14 19a3.5 3.5 0 0 1 7 0" />
    </IconBase>
  )
}

function LogoutIcon() {
  return (
    <IconBase>
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H4" />
      <path d="M20 4v16" />
    </IconBase>
  )
}

const iconByMenuId = {
  dashboard: DashboardIcon,
  drives: DrivesIcon,
  attendance: AttendanceIcon,
  coordinators: CoordinatorsIcon,
}

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  if (localStorage.getItem('token')) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage({ type: '', text: '' })

    try {
      setIsSubmitting(true)
      const response = await axios.post(`${API_BASE_URL}/admin/login`, {
        email: email.trim().toLowerCase(),
        password,
      })
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
      window.location.reload()
    } catch (error) {
      setMessage({ type: 'error', text: errorMessage(error, 'Login failed') })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <h1>Admin Login</h1>
        <p className="login-subtext">Access the attendance management system</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {message.text ? <p className={`status ${message.type === 'error' ? 'error' : 'success'}`}>{message.text}</p> : null}
          <button type="submit" className="primary-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </section>
    </main>
  )
}

function Dashboard() {
  const token = localStorage.getItem('token')
  const user = useMemo(() => parseUser(), [])
  const role = roleOf(user.role)
  const isTpo = role === 'TPO'
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token])
  const [page, setPage] = useState('dashboard')
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => localStorage.getItem('adminSidebarOpen') !== 'false')
  const [drives, setDrives] = useState([])
  const [coordinators, setCoordinators] = useState([])
  const [attendanceRows, setAttendanceRows] = useState([])
  const [selectedDriveId, setSelectedDriveId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDriveBusy, setIsDriveBusy] = useState(false)
  const [isAttendanceBusy, setIsAttendanceBusy] = useState(false)
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false)
  const [scannerEnabled, setScannerEnabled] = useState(false)
  const [lastScannedValue, setLastScannedValue] = useState('')
  const [driveForm, setDriveForm] = useState({ driveName: '', date: '', coordinators: [] })
  const [driveCoordinatorPicker, setDriveCoordinatorPicker] = useState('')
  const [coordinatorForm, setCoordinatorForm] = useState({ name: '', email: '', password: '' })
  const [rollNo, setRollNo] = useState('')
  const [notice, setNotice] = useState({ scope: '', type: '', text: '' })
  const [deletingId, setDeletingId] = useState('')
  const [exportingId, setExportingId] = useState('')
  const [savingDriveId, setSavingDriveId] = useState('')
  const [coordinatorDrafts, setCoordinatorDrafts] = useState({})
  const [coordinatorDraftPicker, setCoordinatorDraftPicker] = useState({})
  const scannerInstanceRef = useRef(null)
  const scanThrottleRef = useRef({ value: '', timestamp: 0 })
  const markInFlightRef = useRef(false)

  const menuItems = isTpo
    ? [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'drives', label: 'Drives' },
      { id: 'attendance', label: 'Attendance' },
      { id: 'coordinators', label: 'Coordinators' },
    ]
    : [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'drives', label: 'My Drives' },
      { id: 'attendance', label: 'Attendance' },
    ]

  const coordinatorMap = useMemo(() => {
    const map = new Map()
    coordinators.forEach((coordinator) => map.set(String(coordinator._id), coordinator))
    return map
  }, [coordinators])

  const availableCoordinatorOptions = useMemo(
    () => coordinators.filter((coordinator) => !driveForm.coordinators.includes(String(coordinator._id))),
    [coordinators, driveForm.coordinators],
  )

  const selectedDrive = useMemo(
    () => drives.find((drive) => String(drive._id) === String(selectedDriveId)) || null,
    [drives, selectedDriveId],
  )

  const upcomingDrives = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    return drives.filter((drive) => new Date(drive.date) >= startOfToday).length
  }, [drives])

  const fetchDrives = async () => {
    const response = await axios.get(`${API_BASE_URL}/drive/my-drives`, headers)
    const nextDrives = dedupeDrives(response.data?.drives || []).map((drive) => ({
      ...drive,
      coordinators: uniqueIds(drive.coordinators),
    }))
    setDrives(nextDrives)
    setCoordinatorDrafts((previous) => {
      const next = { ...previous }
      nextDrives.forEach((drive) => {
        next[String(drive._id)] = uniqueIds(next[String(drive._id)] || drive.coordinators || [])
      })
      return next
    })
    setSelectedDriveId((previous) => {
      if (previous && nextDrives.some((drive) => String(drive._id) === String(previous))) {
        return previous
      }
      return nextDrives[0]?._id || ''
    })
  }

  const fetchCoordinators = async () => {
    if (!isTpo) return
    const response = await axios.get(`${API_BASE_URL}/coordinators`, headers)
    setCoordinators(dedupeCoordinators(response.data?.coordinators || []))
  }

  const fetchAttendance = async (driveId) => {
    if (!driveId) {
      setAttendanceRows([])
      return
    }
    const response = await axios.get(`${API_BASE_URL}/attendance/drive/${driveId}`, headers)
    setAttendanceRows(response.data?.attendance || [])
  }

  useEffect(() => {
    const bootstrap = async () => {
      setIsLoading(true)
      try {
        await Promise.all([fetchDrives(), fetchCoordinators()])
      } catch (error) {
        setNotice({ scope: 'dashboard', type: 'error', text: errorMessage(error, 'Failed to load dashboard') })
      } finally {
        setIsLoading(false)
      }
    }
    bootstrap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const loadAttendance = async () => {
      if (!selectedDriveId) {
        setAttendanceRows([])
        return
      }
      setIsAttendanceBusy(true)
      try {
        await fetchAttendance(selectedDriveId)
      } catch (error) {
        setNotice({ scope: 'attendance', type: 'error', text: errorMessage(error, 'Failed to load attendance') })
      } finally {
        setIsAttendanceBusy(false)
      }
    }
    loadAttendance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDriveId])

  useEffect(() => {
    localStorage.setItem('adminSidebarOpen', String(isSidebarOpen))
  }, [isSidebarOpen])

  useEffect(() => {
    if (window.innerWidth <= 1040) {
      setIsSidebarOpen(false)
    }
  }, [])

  useEffect(() => {
    if (page !== 'attendance' && scannerEnabled) {
      setScannerEnabled(false)
    }
  }, [page, scannerEnabled])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    if (scannerEnabled) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [scannerEnabled])

  useEffect(() => {
    const stopScanner = async () => {
      if (!scannerInstanceRef.current) return
      try {
        await scannerInstanceRef.current.clear()
      } catch {
        // ignore scanner shutdown errors
      } finally {
        scannerInstanceRef.current = null
      }
    }

    const startScanner = async () => {
      if (page !== 'attendance' || !scannerEnabled) {
        await stopScanner()
        return
      }

      if (!selectedDriveId) {
        setNotice({ scope: 'attendance', type: 'warning', text: 'Select a drive before scanning QR' })
        return
      }

      await stopScanner()

      const scanner = new Html5QrcodeScanner(
        'attendance-qr-reader',
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          rememberLastUsedCamera: true,
        },
        false,
      )
      scannerInstanceRef.current = scanner

      scanner.render(
        (decodedText) => {
          const scannedRoll = String(decodedText || '').trim().toUpperCase()
          if (!scannedRoll) return

          const now = Date.now()
          if (
            scanThrottleRef.current.value === scannedRoll
            && now - scanThrottleRef.current.timestamp < 3000
          ) {
            return
          }

          scanThrottleRef.current = { value: scannedRoll, timestamp: now }
          setLastScannedValue(scannedRoll)
          setRollNo(scannedRoll)
          submitAttendance(scannedRoll)
        },
        () => {},
      )
    }

    startScanner()
    return () => {
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, scannerEnabled, selectedDriveId])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.reload()
  }

  const handleCreateDrive = async (event) => {
    event.preventDefault()
    setNotice({ scope: '', type: '', text: '' })

    const normalizedDrive = {
      driveName: driveForm.driveName.trim(),
      date: driveForm.date,
      coordinators: uniqueIds(driveForm.coordinators),
    }

    if (!normalizedDrive.driveName || !normalizedDrive.date) {
      setNotice({ scope: 'drives', type: 'error', text: 'Drive name and date are required' })
      return
    }

    if (drives.some((drive) => driveKey(drive) === driveKey(normalizedDrive))) {
      setNotice({ scope: 'drives', type: 'warning', text: 'Duplicate drive removed. Same drive/date already exists.' })
      return
    }

    try {
      setIsDriveBusy(true)
      await axios.post(`${API_BASE_URL}/drive/create`, normalizedDrive, headers)
      setDriveForm({ driveName: '', date: '', coordinators: [] })
      setDriveCoordinatorPicker('')
      await fetchDrives()
      setNotice({ scope: 'drives', type: 'success', text: 'Drive created successfully' })
    } catch (error) {
      setNotice({ scope: 'drives', type: 'error', text: errorMessage(error, 'Failed to create drive') })
    } finally {
      setIsDriveBusy(false)
    }
  }

  const handleCreateCoordinator = async (event) => {
    event.preventDefault()
    setNotice({ scope: '', type: '', text: '' })

    const normalizedEmail = coordinatorForm.email.trim().toLowerCase()
    if (coordinators.some((coordinator) => String(coordinator.email).trim().toLowerCase() === normalizedEmail)) {
      setNotice({ scope: 'coordinators', type: 'warning', text: 'Coordinator already exists with this email' })
      return
    }

    try {
      await axios.post(
        `${API_BASE_URL}/tpo/create-coordinator`,
        {
          ...coordinatorForm,
          email: normalizedEmail,
        },
        headers,
      )
      setCoordinatorForm({ name: '', email: '', password: '' })
      await fetchCoordinators()
      setNotice({ scope: 'coordinators', type: 'success', text: 'Coordinator created successfully' })
    } catch (error) {
      setNotice({ scope: 'coordinators', type: 'error', text: errorMessage(error, 'Failed to create coordinator') })
    }
  }

  const addCoordinatorToCreateForm = () => {
    if (!driveCoordinatorPicker) return
    setDriveForm((previous) => ({
      ...previous,
      coordinators: uniqueIds([...previous.coordinators, driveCoordinatorPicker]),
    }))
    setDriveCoordinatorPicker('')
  }

  const removeCoordinatorFromCreateForm = (coordinatorId) => {
    setDriveForm((previous) => ({
      ...previous,
      coordinators: previous.coordinators.filter((id) => String(id) !== String(coordinatorId)),
    }))
  }

  const addCoordinatorToDraft = (driveId) => {
    const selectedCoordinatorId = coordinatorDraftPicker[String(driveId)]
    if (!selectedCoordinatorId) return

    setCoordinatorDrafts((previous) => ({
      ...previous,
      [String(driveId)]: uniqueIds([...(previous[String(driveId)] || []), selectedCoordinatorId]),
    }))
    setCoordinatorDraftPicker((previous) => ({
      ...previous,
      [String(driveId)]: '',
    }))
  }

  const removeCoordinatorFromDraft = (driveId, coordinatorId) => {
    setCoordinatorDrafts((previous) => ({
      ...previous,
      [String(driveId)]: (previous[String(driveId)] || []).filter((id) => String(id) !== String(coordinatorId)),
    }))
  }

  const submitAttendance = async (rollValue) => {
    setNotice({ scope: '', type: '', text: '' })

    const normalizedRollNo = String(rollValue || '').trim().toUpperCase()
    if (!selectedDriveId) {
      setNotice({ scope: 'attendance', type: 'error', text: 'Select a drive before marking attendance' })
      return
    }

    if (!normalizedRollNo) {
      setNotice({ scope: 'attendance', type: 'error', text: 'Roll number is required' })
      return
    }

    if (markInFlightRef.current) return
    markInFlightRef.current = true

    try {
      setIsMarkingAttendance(true)
      await axios.post(`${API_BASE_URL}/attendance/scan`, { driveId: selectedDriveId, rollNo: normalizedRollNo }, headers)
      setRollNo('')
      await fetchAttendance(selectedDriveId)
      setNotice({ scope: 'attendance', type: 'success', text: `Attendance marked: ${normalizedRollNo}` })
    } catch (error) {
      setNotice({ scope: 'attendance', type: 'error', text: errorMessage(error, 'Failed to mark attendance') })
    } finally {
      setIsMarkingAttendance(false)
      markInFlightRef.current = false
    }
  }

  const handleMarkAttendance = async (event) => {
    event.preventDefault()
    await submitAttendance(rollNo)
  }

  const handleOpenScanner = () => {
    if (!selectedDriveId) {
      setNotice({ scope: 'attendance', type: 'warning', text: 'Select a drive before opening scanner' })
      return
    }
    setScannerEnabled(true)
  }

  const handleDeleteAttendance = async (attendanceId) => {
    if (!window.confirm('Delete this attendance record?')) return
    try {
      setDeletingId(String(attendanceId))
      await axios.delete(`${API_BASE_URL}/attendance/${attendanceId}`, headers)
      await fetchAttendance(selectedDriveId)
      setNotice({ scope: 'attendance', type: 'success', text: 'Attendance deleted successfully' })
    } catch (error) {
      setNotice({ scope: 'attendance', type: 'error', text: errorMessage(error, 'Failed to delete attendance') })
    } finally {
      setDeletingId('')
    }
  }

  const handleExport = async (drive) => {
    try {
      setExportingId(String(drive._id))
      const response = await axios.get(`${API_BASE_URL}/drive/${drive._id}/export`, { ...headers, responseType: 'blob' })
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${drive.driveName || 'drive'}-${drive._id}-attendance.csv`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      setNotice({ scope: 'drives', type: 'error', text: errorMessage(error, 'Failed to export attendance') })
    } finally {
      setExportingId('')
    }
  }

  const handleUpdateDriveCoordinators = async (driveId) => {
    setNotice({ scope: '', type: '', text: '' })
    try {
      setSavingDriveId(String(driveId))
      await axios.patch(
        `${API_BASE_URL}/drive/${driveId}/coordinators`,
        { coordinators: uniqueIds(coordinatorDrafts[String(driveId)] || []) },
        headers,
      )
      await fetchDrives()
      setNotice({ scope: 'drives', type: 'success', text: 'Drive coordinators updated' })
    } catch (error) {
      setNotice({ scope: 'drives', type: 'error', text: errorMessage(error, 'Failed to update coordinators') })
    } finally {
      setSavingDriveId('')
    }
  }

  const pageTitle = menuItems.find((item) => item.id === page)?.label || 'Dashboard'
  const handleMenuSelect = (nextPage) => {
    setPage(nextPage)
    setIsSidebarOpen(false)
  }

  if (!token || !user.email) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className={`admin-shell ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <aside className="admin-sidebar">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setIsSidebarOpen((previous) => !previous)}
          aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          title={isSidebarOpen ? 'Collapse menu' : 'Expand menu'}
        >
          {isSidebarOpen ? 'Close Menu' : 'Menu'}
        </button>
        <div className="brand-block">
          <h1>{isSidebarOpen ? 'Attendance' : 'AMS'}</h1>
          {isSidebarOpen ? <p className="brand-kicker">Management System</p> : null}
        </div>
        <nav className="side-menu">
          {menuItems.map((item) => {
            const MenuIcon = iconByMenuId[item.id] || DashboardIcon
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                className={`side-link ${page === item.id ? 'active' : ''}`}
                onClick={() => handleMenuSelect(item.id)}
              >
                <span className="side-link-icon">
                  <MenuIcon />
                </span>
                {isSidebarOpen ? <span className="side-link-label">{item.label}</span> : null}
              </button>
            )
          })}
        </nav>
        <div className="side-footer">
          {isSidebarOpen ? (
            <>
              <span>Logged in as</span>
              <strong>{user.name}</strong>
              <strong>{user.email}</strong>
              <strong>{role || 'UNKNOWN'}</strong>
            </>
          ) : null}
          <button type="button" onClick={handleLogout} className="side-link" style={{ marginTop: '10px' }} title="Logout" aria-label="Logout">
            <span className="side-link-icon">
              <LogoutIcon />
            </span>
            {isSidebarOpen ? <span className="side-link-label">Logout</span> : null}
          </button>
        </div>
      </aside>
      <button
        type="button"
        className={`mobile-backdrop ${isSidebarOpen ? 'show' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label="Close menu"
      />
      <main className="workspace">
        <header className="workspace-header">
          <div>
            <h2>{pageTitle}</h2>
            <p>Manage drives, coordinators, and attendance from one place.</p>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="header-btn quiet"
              onClick={() => setIsSidebarOpen((previous) => !previous)}
              title={isSidebarOpen ? 'Collapse menu' : 'Expand menu'}
              aria-label={isSidebarOpen ? 'Collapse menu' : 'Expand menu'}
            >
              {isSidebarOpen ? 'Close Menu' : 'Menu'}
            </button>
            <button type="button" className="header-btn quiet" onClick={fetchDrives}>Sync Drives</button>
            <div className="header-date">{new Date().toLocaleDateString()}</div>
          </div>
        </header>
        <div className="workspace-body">
          {isLoading ? <section className="panel-surface"><p className="muted">Loading dashboard data...</p></section> : null}
          {!isLoading && page === 'dashboard' ? (
            <>
              <div className="stats-grid">
                <div className="stat-card rose"><p>Total Drives</p><strong>{drives.length}</strong><span>Created</span></div>
                <div className="stat-card emerald"><p>Upcoming Drives</p><strong>{upcomingDrives}</strong><span>Scheduled</span></div>
                <div className="stat-card aqua"><p>Drive Attendance</p><strong>{attendanceRows.length}</strong><span>Selected drive</span></div>
                <div className="stat-card olive"><p>{isTpo ? 'Coordinators' : 'Role'}</p><strong>{isTpo ? coordinators.length : role}</strong><span>{isTpo ? 'Active' : 'Access level'}</span></div>
              </div>
              <section className="panel-surface">
                <div className="panel-head"><div><p className="panel-kicker">Quick View</p><h3>Recent Drives</h3></div></div>
                <ul className="drive-list">
                  {drives.slice(0, 6).map((drive) => <li key={drive._id} className="drive-item"><p className="drive-name">{drive.driveName}</p><p className="drive-date">{formatDate(drive.date)}</p></li>)}
                </ul>
              </section>
            </>
          ) : null}
          {!isLoading && page === 'drives' ? (
            <div className="dashboard-grid">
              {isTpo ? (
                <section className="panel-surface">
                  <div className="panel-head"><div><p className="panel-kicker">Create</p><h3>New Drive</h3></div></div>
                  <form onSubmit={handleCreateDrive} className="form-grid">
                    <label>Drive Name<input name="driveName" value={driveForm.driveName} onChange={(event) => setDriveForm((prev) => ({ ...prev, driveName: event.target.value }))} required /></label>
                    <label>Date<input type="date" name="date" value={driveForm.date} onChange={(event) => setDriveForm((prev) => ({ ...prev, date: event.target.value }))} required /></label>
                    <div className="dropdown-select">
                      <label>
                        Add Coordinator
                        <select value={driveCoordinatorPicker} onChange={(event) => setDriveCoordinatorPicker(event.target.value)}>
                          <option value="">Select coordinator</option>
                          {availableCoordinatorOptions.map((coordinator) => (
                            <option key={coordinator._id} value={coordinator._id}>
                              {coordinator.name} ({coordinator.email})
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className="pill-btn alt" onClick={addCoordinatorToCreateForm} disabled={!driveCoordinatorPicker}>
                        Add
                      </button>
                    </div>
                    <div className="selected-tags">
                      {driveForm.coordinators.length === 0 ? (
                        <span className="muted">No coordinators selected.</span>
                      ) : (
                        driveForm.coordinators.map((coordinatorId) => {
                          const coordinator = coordinatorMap.get(String(coordinatorId))
                          if (!coordinator) return null
                          return (
                            <button
                              key={coordinatorId}
                              type="button"
                              className="tag-chip"
                              onClick={() => removeCoordinatorFromCreateForm(coordinatorId)}
                              title="Remove coordinator"
                            >
                              {coordinator.name} x
                            </button>
                          )
                        })
                      )}
                    </div>
                    <button type="submit" className="primary-btn" disabled={isDriveBusy}>{isDriveBusy ? 'Creating...' : 'Create Drive'}</button>
                  </form>
                </section>
              ) : <section className="panel-surface"><p className="muted">Your assigned drives are listed here.</p></section>}
              <section className="panel-surface">
                <div className="panel-head"><div><p className="panel-kicker">Manage</p><h3>{isTpo ? 'All Drives' : 'Assigned Drives'}</h3></div></div>
                {notice.scope === 'drives' && notice.text ? <p className={`status ${noticeClass(notice.type)}`}>{notice.text}</p> : null}
                <div className="drive-cards">
                  {drives.map((drive) => {
                    const names = (drive.coordinators || []).map((id) => coordinatorMap.get(String(id))?.name).filter(Boolean)
                    return (
                      <div key={drive._id} className="drive-card">
                        <div className="drive-card-top">
                          <div>
                            <p className="drive-name">{drive.driveName}</p>
                            <p className="drive-date">{formatDate(drive.date)}</p>
                            {isTpo ? <p className="drive-meta">Coordinators: {names.length > 0 ? names.join(', ') : 'Not assigned'}</p> : null}
                          </div>
                          <div className="drive-card-actions">
                            <button type="button" className="pill-btn" onClick={() => { setSelectedDriveId(String(drive._id)); setPage('attendance') }}>Attendance</button>
                            {isTpo ? <button type="button" className="pill-btn alt" onClick={() => handleExport(drive)} disabled={exportingId === String(drive._id)}>{exportingId === String(drive._id) ? 'Exporting...' : 'Export CSV'}</button> : null}
                          </div>
                        </div>
                        {isTpo ? (
                          <div className="drive-assignment">
                            <div className="dropdown-select">
                              <label>
                                Add Coordinator
                                <select
                                  value={coordinatorDraftPicker[String(drive._id)] || ''}
                                  onChange={(event) =>
                                    setCoordinatorDraftPicker((previous) => ({
                                      ...previous,
                                      [String(drive._id)]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Select coordinator</option>
                                  {coordinators
                                    .filter((coordinator) => !(coordinatorDrafts[String(drive._id)] || []).includes(String(coordinator._id)))
                                    .map((coordinator) => (
                                      <option key={coordinator._id} value={coordinator._id}>
                                        {coordinator.name} ({coordinator.email})
                                      </option>
                                    ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                className="pill-btn alt"
                                onClick={() => addCoordinatorToDraft(String(drive._id))}
                                disabled={!coordinatorDraftPicker[String(drive._id)]}
                              >
                                Add
                              </button>
                            </div>
                            <div className="selected-tags">
                              {(coordinatorDrafts[String(drive._id)] || []).length === 0 ? (
                                <span className="muted">No coordinators selected.</span>
                              ) : (
                                (coordinatorDrafts[String(drive._id)] || []).map((coordinatorId) => {
                                  const coordinator = coordinatorMap.get(String(coordinatorId))
                                  if (!coordinator) return null
                                  return (
                                    <button
                                      key={`${drive._id}-${coordinatorId}`}
                                      type="button"
                                      className="tag-chip"
                                      onClick={() => removeCoordinatorFromDraft(String(drive._id), String(coordinatorId))}
                                      title="Remove coordinator"
                                    >
                                      {coordinator.name} x
                                    </button>
                                  )
                                })
                              )}
                            </div>
                            <button
                              type="button"
                              className="pill-btn"
                              onClick={() => handleUpdateDriveCoordinators(String(drive._id))}
                              disabled={savingDriveId === String(drive._id)}
                            >
                              {savingDriveId === String(drive._id) ? 'Saving...' : 'Save Coordinators'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
          ) : null}
          {!isLoading && page === 'attendance' ? (
            <div className="scan-grid">
              <section className="panel-surface">
                <div className="panel-head">
                  <div>
                    <p className="panel-kicker">Mark</p>
                    <h3>Attendance Entry</h3>
                  </div>
                  <button
                    type="button"
                    className={`pill-btn ${scannerEnabled ? 'alt' : ''}`}
                    onClick={handleOpenScanner}
                  >
                    {scannerEnabled ? 'Scanner Open' : 'Start QR'}
                  </button>
                </div>
                <form onSubmit={handleMarkAttendance} className="form-grid">
                  <label>Drive<select value={selectedDriveId} onChange={(event) => setSelectedDriveId(event.target.value)} required><option value="" disabled>Select drive</option>{drives.map((drive) => <option key={drive._id} value={drive._id}>{drive.driveName} ({formatDate(drive.date)})</option>)}</select></label>
                  <label>Roll Number<input value={rollNo} onChange={(event) => setRollNo(event.target.value.toUpperCase())} required /></label>
                  <button type="submit" className="primary-btn" disabled={isMarkingAttendance}>
                    {isMarkingAttendance ? 'Marking...' : 'Mark Attendance'}
                  </button>
                </form>
                {scannerEnabled ? <p className="muted">Scanner is open in center view.</p> : <p className="muted">QR scanner is off. Use Start QR to scan student codes.</p>}
                {notice.scope === 'attendance' && notice.text ? <p className={`status ${noticeClass(notice.type)}`}>{notice.text}</p> : null}
              </section>
              <section className="panel-surface">
                <div className="panel-head"><div><p className="panel-kicker">Records</p><h3>{selectedDrive?.driveName || 'Attendance'}</h3></div><button type="button" className="pill-btn alt" onClick={() => fetchAttendance(selectedDriveId)} disabled={isAttendanceBusy}>{isAttendanceBusy ? 'Refreshing...' : 'Refresh'}</button></div>
                <div className="table-wrap">
                  <table className="attendance-table">
                    <thead><tr><th>Roll No</th><th>Name</th><th>Branch</th><th>Timestamp</th><th>Action</th></tr></thead>
                    <tbody>
                      {attendanceRows.length === 0 ? <tr><td colSpan={5} className="empty-cell">No attendance records found.</td></tr> : attendanceRows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.rollNo}</td>
                          <td>{row.name || '-'}</td>
                          <td>{row.branch || '-'}</td>
                          <td>{formatDateTime(row.timestamp)}</td>
                          <td><button type="button" className="danger-btn" onClick={() => handleDeleteAttendance(row.id)} disabled={deletingId === String(row.id)}>{deletingId === String(row.id) ? 'Deleting...' : 'Delete'}</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="attendance-mobile-list">
                  {attendanceRows.length === 0 ? (
                    <p className="muted">No attendance records found.</p>
                  ) : (
                    attendanceRows.map((row) => (
                      <article key={`mobile-${row.id}`} className="attendance-mobile-card">
                        <p><strong>Roll No:</strong> {row.rollNo}</p>
                        <p><strong>Name:</strong> {row.name || '-'}</p>
                        <p><strong>Branch:</strong> {row.branch || '-'}</p>
                        <p><strong>Time:</strong> {formatDateTime(row.timestamp)}</p>
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => handleDeleteAttendance(row.id)}
                          disabled={deletingId === String(row.id)}
                        >
                          {deletingId === String(row.id) ? 'Deleting...' : 'Delete'}
                        </button>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          ) : null}
          {!isLoading && page === 'coordinators' ? (
            isTpo ? (
              <div className="dashboard-grid">
                <section className="panel-surface">
                  <div className="panel-head"><div><p className="panel-kicker">Create</p><h3>New Coordinator</h3></div></div>
                  <form onSubmit={handleCreateCoordinator} className="form-grid">
                    <label>Name<input value={coordinatorForm.name} onChange={(event) => setCoordinatorForm((prev) => ({ ...prev, name: event.target.value }))} required /></label>
                    <label>Email<input type="email" value={coordinatorForm.email} onChange={(event) => setCoordinatorForm((prev) => ({ ...prev, email: event.target.value }))} required /></label>
                    <label>Password<input type="password" value={coordinatorForm.password} onChange={(event) => setCoordinatorForm((prev) => ({ ...prev, password: event.target.value }))} required /></label>
                    <button type="submit" className="primary-btn">Create Coordinator</button>
                  </form>
                </section>
                <section className="panel-surface">
                  <div className="panel-head"><div><p className="panel-kicker">Directory</p><h3>Coordinators</h3></div></div>
                  {notice.scope === 'coordinators' && notice.text ? <p className={`status ${noticeClass(notice.type)}`}>{notice.text}</p> : null}
                  <ul className="activity-list">
                    {coordinators.map((coordinator) => <li key={coordinator._id}><span>{coordinator.name}</span><small>{coordinator.email}</small></li>)}
                  </ul>
                </section>
              </div>
            ) : <section className="panel-surface"><p className="status warning">Coordinator management is available only for TPO users.</p></section>
          ) : null}
          {notice.scope === 'dashboard' && notice.text ? <p className={`status ${noticeClass(notice.type)}`}>{notice.text}</p> : null}
        </div>
      </main>
      {scannerEnabled && page === 'attendance' ? (
        <div className="qr-overlay" role="dialog" aria-modal="true" aria-label="QR Scanner">
          <div className="qr-modal">
            <div className="qr-overlay-head">
              <div>
                <p className="panel-kicker">Live Scanner</p>
                <h3>{selectedDrive?.driveName || 'Selected Drive'}</h3>
              </div>
            </div>
            <div className="qr-overlay-body">
              <div id="attendance-qr-reader" className="qr-reader qr-reader-modal" />
              {lastScannedValue ? (
                <div className="result-tile">
                  <span>Last Scanned Roll</span>
                  <strong>{lastScannedValue}</strong>
                </div>
              ) : (
                <p className="muted">Point camera at student QR code to mark attendance.</p>
              )}
              {notice.scope === 'attendance' && notice.text ? (
                <p className={`status ${noticeClass(notice.type)}`}>{notice.text}</p>
              ) : null}
            </div>
            <div className="qr-overlay-actions">
              <button type="button" className="primary-btn" onClick={() => setScannerEnabled(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function App() {
  const token = localStorage.getItem('token')

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={token ? <Dashboard /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
