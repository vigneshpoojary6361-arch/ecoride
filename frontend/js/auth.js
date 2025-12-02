// Authentication utilities
const API_BASE_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:5008/api' 
    : `${window.location.origin}/api`;

// Check if user is authenticated
function isAuthenticated() {
    return localStorage.getItem('token') !== null;
}

// Get token from localStorage
function getToken() {
    return localStorage.getItem('token');
}

// Get user data from localStorage
function getUserData() {
    const userData = localStorage.getItem('userData');
    return userData ? JSON.parse(userData) : null;
}

// Set authentication data
function setAuthData(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('userData', JSON.stringify(user));
}

// Clear authentication data
function clearAuthData() {
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
}

// API request helper
async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        },
        ...options
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'An error occurred');
        }

        return data;
    } catch (error) {
        console.error('API Request Error:', error);

        if (error.message.includes('Token') || error.message.includes('Authorization')) {
            clearAuthData();
            window.location.href = '/login';
        }

        throw error;
    }
}

// Logout
function logout() {
    clearAuthData();
    window.location.href = '/';
}

// Redirect user
function redirectToDashboard(user) {
    if (user.role === 'admin') {
        window.location.href = '/dashboard-admin';
    } else {
        window.location.href = '/dashboard-user';
    }
}

// Check authentication on protected pages
function checkAuth() {
    if (!isAuthenticated()) {
        window.location.href = '/login';
        return;
    }

    const user = getUserData();
    if (user && user.name) {
        const nameElement = document.getElementById('userName') || document.getElementById('adminName');
        if (nameElement) {
            nameElement.textContent = user.name;
        }
    }
}

// Login form handler
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const loginBtn = document.getElementById('loginBtn');
        const loginSpinner = document.getElementById('loginSpinner');
        const loginAlert = document.getElementById('loginAlert');

        loginBtn.disabled = true;
        loginSpinner.classList.remove('d-none');
        loginAlert.classList.add('d-none');

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            // ✅ If email not verified
            if (data.requireVerification) {
                loginAlert.textContent = "Please verify your email before logging in. Check your inbox!";
                loginAlert.classList.remove('d-none');
                return;
            }

            // Save auth data and redirect
            setAuthData(data.token, data.user);
            redirectToDashboard(data.user);

        } catch (error) {
            loginAlert.textContent = error.message;
            loginAlert.classList.remove('d-none');
        } finally {
            loginBtn.disabled = false;
            loginSpinner.classList.add('d-none');
        }
    });
}

// Signup form handler
if (document.getElementById('signupForm')) {
    document.getElementById('signupForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const phone = document.getElementById('phone').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const signupBtn = document.getElementById('signupBtn');
        const signupSpinner = document.getElementById('signupSpinner');
        const signupAlert = document.getElementById('signupAlert');

        if (password !== confirmPassword) {
            signupAlert.textContent = 'Passwords do not match';
            signupAlert.classList.remove('d-none');
            return;
        }

        signupBtn.disabled = true;
        signupSpinner.classList.remove('d-none');
        signupAlert.classList.add('d-none');

        try {
            const response = await fetch(`${API_BASE_URL}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, phone, password })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message);

            // ✅ Instead of logging in automatically:
            signupAlert.textContent = "Signup successful! Please check your email to verify your account.";
            signupAlert.classList.remove('d-none');
            signupAlert.classList.add('alert-success');

        } catch (error) {
            signupAlert.textContent = error.message;
            signupAlert.classList.remove('d-none');
            signupAlert.classList.add('alert-danger');
        } finally {
            signupBtn.disabled = false;
            signupSpinner.classList.add('d-none');
        }
    });
}

// Check auth on load
document.addEventListener('DOMContentLoaded', function() {
    const currentPage = window.location.pathname;

    if (currentPage.includes('dashboard')) {
        checkAuth();
        const user = getUserData();
        if (user) {
            if (currentPage.includes('admin') && user.role !== 'admin') {
                window.location.href = '/dashboard-user';
            } else if (currentPage.includes('user') && user.role === 'admin') {
                window.location.href = '/dashboard-admin';
            }
        }
    }

    if ((currentPage === '/login' || currentPage === '/signup') && isAuthenticated()) {
        const user = getUserData();
        if (user) redirectToDashboard(user);
    }
});