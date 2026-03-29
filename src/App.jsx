import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Login from './Components/Login';
import Dashboard from './Pages/Dashboard';
import MeetingForm from './Components/meeting/MeetingForm';
import CalendarGrid from './Components/calendar/CalendarGrid';
import ProfilePage from './Pages/Profile';
import CreateMeeting from './Pages/CreateMeeting';
import AdminPage from './Pages/AdminPage';
import MainLayout from './Components/layout/MainLayout';
import Settings from './Pages/Settings';
import MyDashboard from './Pages/MyDashboard';
import { useFCM } from './hooks/useFCM';

const PrivateRoute = ({ children }) => {
    const { currentUser } = useAuth();
    return currentUser ? children : <Navigate to="/login" />;
};

// FCM 토큰 자동 갱신 + 포그라운드 알림 수신
const FCMInitializer = () => {
    const { currentUser } = useAuth();
    useFCM(currentUser);
    return null;
};

const App = () => {
    return (
        <AuthProvider>
            <FCMInitializer />
            <ToastProvider>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/*" element={
                        <PrivateRoute>
                            <MainLayout>
                                <Routes>
                                    <Route path="/" element={<Dashboard />} />
                                    <Route path="/calendar" element={<CalendarGrid />} />
                                    <Route path="/schedule" element={<MeetingForm />} />
                                    <Route path="/profile" element={<ProfilePage />} />
                                    <Route path="/create-meeting" element={<CreateMeeting />} />
                                    <Route path="/admin" element={<AdminPage />} />
                                    <Route path="/my-dashboard" element={<MyDashboard />} />
                                    <Route path="/settings" element={<Settings />} />
                                </Routes>
                            </MainLayout>
                        </PrivateRoute>
                    } />
                </Routes>
            </ToastProvider>
        </AuthProvider>
    );
};

export default App;
