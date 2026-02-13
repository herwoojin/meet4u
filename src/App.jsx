import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './Components/Login';
import Dashboard from './Pages/Dashboard';
import MeetingForm from './Components/meeting/MeetingForm';
import CalendarGrid from './Components/calendar/CalendarGrid';
import ProfilePage from './Pages/Profile';
import CreateMeeting from './Pages/CreateMeeting';
import MainLayout from './Components/layout/MainLayout';

const PrivateRoute = ({ children }) => {
    const { currentUser } = useAuth();
    return currentUser ? children : <Navigate to="/login" />;
};

const App = () => {
    return (
        <AuthProvider>
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
                                <Route path="/settings" element={<div className="text-center p-10 text-gray-500">설정 (준비 중)</div>} />
                            </Routes>
                        </MainLayout>
                    </PrivateRoute>
                } />
            </Routes>
        </AuthProvider>
    );
};

export default App;
