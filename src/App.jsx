import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { ToastContainer, toast } from 'react-toastify'
import { AlertTriangle, Zap, Activity, Navigation, ShieldAlert, Volume2 } from 'lucide-react'
import 'react-toastify/dist/ReactToastify.css'

// Helper component to recenter map
function RecenterAutomatically({lat, lng}) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]);
  }, [lat, lng]);
  return null;
}

// Circular Gauge Component
const Speedometer = ({ value, max = 180 }) => {
  const radius = 90;
  const circumference = Math.PI * radius; // Half circle
  
  // Constrain value
  const clampedValue = Math.min(Math.max(value, 0), max);
  const percentage = clampedValue / max;
  const strokeDashoffset = circumference - (percentage * circumference);

  return (
    <div className="speed-display">
      <svg width="240" height="150" viewBox="0 0 240 150">
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        
        {/* Background Arc */}
        <path 
          d="M 30 130 A 90 90 0 0 1 210 130" 
          fill="none" 
          stroke="rgba(255,255,255,0.1)" 
          strokeWidth="20" 
          strokeLinecap="round" 
        />
        
        {/* Value Arc */}
        <path 
          d="M 30 130 A 90 90 0 0 1 210 130" 
          fill="none" 
          stroke="url(#gradient)" 
          strokeWidth="20" 
          strokeLinecap="round" 
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
        />
      </svg>
      <div style={{ position: 'absolute', bottom: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span className="speed-value">{Math.round(value)}</span>
        <span className="speed-unit">km/h</span>
      </div>
    </div>
  );
};

export default function App() {
  const [data, setData] = useState({
    lat: 0,
    lon: 0,
    speed: 0,
    accel: 0,
    event: 'none'
  });
  const [eventsLog, setEventsLog] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isSOS, setIsSOS] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  
  const lastProcessedTimeRef = useRef(null);
  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);

  // Initialize Audio
  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    setAudioEnabled(true);
    
    // Tiny confirmation blip
    try {
      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      osc.frequency.setValueAtTime(600, audioCtxRef.current.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtxRef.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      osc.start();
      osc.stop(audioCtxRef.current.currentTime + 0.1);
    } catch(e) {}
  };

  const playBeep = useCallback((type) => {
    if (!audioCtxRef.current) return;
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();

    if (type === 'sos') {
      if (oscillatorRef.current) return; // Already beeping
      
      const osc = audioCtxRef.current.createOscillator();
      const lfo = audioCtxRef.current.createOscillator();
      const lfoGain = audioCtxRef.current.createGain();
      const mainGain = audioCtxRef.current.createGain();
      
      osc.type = 'square';
      lfo.type = 'square';
      
      // Siren speed
      lfo.frequency.value = 2.5; 
      // Depth of frequency sweep
      lfoGain.gain.value = 300; 
      // Base frequency
      osc.frequency.value = 800; // Will swing between 500 and 1100
      
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      
      osc.connect(mainGain);
      mainGain.connect(audioCtxRef.current.destination);
      
      lfo.start();
      osc.start();
      oscillatorRef.current = { osc, lfo, lfoGain, gainNode: mainGain };
      
    } else if (type === 'buzzer') {
      const osc = audioCtxRef.current.createOscillator();
      const gainNode = audioCtxRef.current.createGain();
      
      osc.type = 'triangle'; 
      
      // Tone 1
      osc.frequency.setValueAtTime(800, audioCtxRef.current.currentTime);
      gainNode.gain.setValueAtTime(0, audioCtxRef.current.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, audioCtxRef.current.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + 0.15);
      
      // Tone 2
      osc.frequency.setValueAtTime(1200, audioCtxRef.current.currentTime + 0.15);
      gainNode.gain.linearRampToValueAtTime(0.5, audioCtxRef.current.currentTime + 0.17);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtxRef.current.currentTime + 0.5);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtxRef.current.destination);
      
      osc.start(audioCtxRef.current.currentTime);
      osc.stop(audioCtxRef.current.currentTime + 0.5);
    }
  }, []);

  const stopSOSBeep = () => {
    if (oscillatorRef.current) {
      if (oscillatorRef.current.osc) oscillatorRef.current.osc.stop();
      if (oscillatorRef.current.lfo) oscillatorRef.current.lfo.stop();
      if (oscillatorRef.current.osc) oscillatorRef.current.osc.disconnect();
      if (oscillatorRef.current.lfoGain) oscillatorRef.current.lfoGain.disconnect();
      if (oscillatorRef.current.gainNode) oscillatorRef.current.gainNode.disconnect();
      oscillatorRef.current = null;
    }
    setIsSOS(false);
  };

  // Fetching data loop
  useEffect(() => {
    let interval;
    const fetchData = async () => {
      try {
        const res = await fetch("http://localhost:3000/events");
        const json = await res.json();
        setIsConnected(true);
        
        if (json.length > 0) {
          const sortedEvents = [...json].sort((a, b) => new Date(a.time) - new Date(b.time));
          const latest = sortedEvents[sortedEvents.length - 1];
          setData({
            lat: Number(latest.lat),
            lon: Number(latest.lon),
            speed: Number(latest.speed),
            accel: Number(latest.accel),
            event: latest.event
          });
          
          setEventsLog([...sortedEvents].reverse());

          // Process new events for alerts
          if (!lastProcessedTimeRef.current) {
             if (sortedEvents.length > 0) {
               lastProcessedTimeRef.current = new Date(sortedEvents[sortedEvents.length - 1].time).getTime();
             }
             return; // Do not replay historical alerts on first load
          }

          const newEvents = sortedEvents.filter(e => {
            const time = new Date(e.time).getTime();
            return time > lastProcessedTimeRef.current;
          });

          if (newEvents.length > 0) {
            lastProcessedTimeRef.current = new Date(newEvents[newEvents.length - 1].time).getTime();
            
            newEvents.forEach(e => {
              // Alerts logic
              if (e.event === 'overspeed') {
                toast.warning(`Overspeed Alert! Speed: ${e.speed} km/h`, { theme: "dark" });
                playBeep('buzzer');
              }
              if (e.event === 'high_accel') {
                toast.warning(`High Acceleration Detected! : ${e.accel}g`, { theme: "dark" });
                playBeep('buzzer');
              }
              if (e.event === 'sudden_change') {
                toast.error(`Sudden Speed Change Detected!`, { theme: "dark" });
                playBeep('buzzer');
              }
              if (e.event === 'sos') {
                toast.error(`🚨 SOS REQUEST RECEIVED 🚨`, { theme: "dark", autoClose: false });
                setIsSOS(true);
                playBeep('sos');
              }
            });
          }
        }
      } catch (err) {
        setIsConnected(false);
      }
    };

    interval = setInterval(fetchData, 2000);
    return () => {
      clearInterval(interval);
      if (oscillatorRef.current) {
        oscillatorRef.current.osc.stop();
      }
    };
  }, [playBeep]);

  const getEventIcon = (type) => {
    switch(type) {
      case 'sos': return <ShieldAlert size={20} />;
      case 'overspeed': return <AlertTriangle size={20} />;
      case 'sudden_change': return <Activity size={20} />;
      case 'high_accel': return <Zap size={20} />;
      default: return <Navigation size={20} />;
    }
  };

  return (
    <>
      {!audioEnabled && (
        <div className="audio-init-banner" onClick={initAudio}>
          <Volume2 size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Click here to enable AUDIO ALERTS for SOS and Events
        </div>
      )}
      
      {isSOS && (
        <div className="sos-overlay">
          <div className="sos-text">SOS REQUEST</div>
          <p style={{color: 'white', marginBottom: '2rem', fontSize: '1.25rem'}}>Emergency assist required at {data.lat.toFixed(4)}, {data.lon.toFixed(4)}</p>
          <button className="dismiss-button" onClick={stopSOSBeep}>Dismiss Alarm</button>
        </div>
      )}

      <div className="dashboard-container">
        <header className="header">
          <div className="header-title">
            <ShieldAlert size={36} color="#3b82f6" />
            <b>Smart Keychain</b> Dashboard
          </div>
          <div className={`status-badge ${!isConnected ? 'disconnected' : ''}`}>
            <div className="status-dot"></div>
            {isConnected ? 'Connected & Live' : 'Offline / Waiting...'}
          </div>
        </header>

        <div className="grid-layout">
          {/* Main Visuals Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Live Map Card */}
            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
              <div className="card-title" style={{ padding: '1.5rem 1.5rem 0', marginBottom: '1rem' }}>
                <Navigation size={24} /> Live Location Tracking
              </div>
              <div className="map-container">
                <MapContainer center={[data.lat || 0, data.lon || 0]} zoom={15} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap contributors"
                  />
                  {data.lat !== 0 && (
                    <>
                      <Marker position={[data.lat, data.lon]}>
                        <Popup>
                          Current Position <br/> Speed: {data.speed} km/h
                        </Popup>
                      </Marker>
                      <RecenterAutomatically lat={data.lat} lng={data.lon} />
                    </>
                  )}
                </MapContainer>
              </div>
            </div>
          </div>

          {/* Sidebar Area Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            <div className="card">
              <div className="card-title">
                <Activity size={24} /> Telemetrics
              </div>
              <Speedometer value={data.speed} />
              
              <div className="telemetry-grid">
                <div className="telemetry-box">
                  <div className="telemetry-label">Acceleration</div>
                  <div className="telemetry-val">{data.accel.toFixed(1)} g</div>
                </div>
                <div className="telemetry-box">
                  <div className="telemetry-label">Latest Event</div>
                  <div className="telemetry-val" style={{fontSize: '1rem', marginTop: '0.5rem',textTransform: 'uppercase'}}>{data.event}</div>
                </div>
              </div>
            </div>

            {/* Event Log */}
            <div className="card">
              <div className="card-title">
                <AlertTriangle size={24} /> Alerts Log
              </div>
              <ul className="events-list">
                {eventsLog.length === 0 ? (
                  <li style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>No events recorded yet.</li>
                ) : (
                  eventsLog.map((event, i) => (
                    <li key={i} className="event-item">
                      <div className={`event-icon ${event.event}`}>
                        {getEventIcon(event.event)}
                      </div>
                      <div className="event-details">
                        <div className="event-type">{event.event.replace('_', ' ')}</div>
                        <div className="event-meta">
                          <span>{event.speed} km/h</span>
                          <span>{new Date(event.time).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <ToastContainer position="top-right" />
    </>
  )
}
