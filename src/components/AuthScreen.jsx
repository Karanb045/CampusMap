import { useState } from 'react';
import useAuth from '../hooks/useAuth';

export default function AuthScreen({ onSuccess, onGuest }) {
  const { loginWithEmail, loginWithGoogle, registerWithEmail, resetPassword } = useAuth();
  const [activeTab, setActiveTab] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSignIn = async (e) => {
    e.preventDefault();
    
    if (!email) {
      setErrorMsg('Please enter your email address');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your password');
      return;
    }
    
    setIsSubmitting(true);
    setErrorMsg('');
    
    try {
      const result = await loginWithEmail(email, password);
      onSuccess();
    } catch (error) {
      console.error('Sign in error:', error);
      handleError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      setErrorMsg('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters');
      return;
    }
    setIsSubmitting(true);
    try {
      await registerWithEmail(email, password, fullName);
      onSuccess();
    } catch (error) {
      handleError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setErrorMsg('');
    
    try {
      const result = await loginWithGoogle();
      onSuccess();
    } catch (error) {
      console.error('Google sign in error:', error);
      handleError(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleError = (error) => {
    console.error('Auth error details:', error);
    
    switch (error.code) {
      case 'auth/user-not-found':
        setErrorMsg('No account found with this email.');
        break;
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
        setErrorMsg('Incorrect password or email.');
        break;
      case 'auth/email-already-in-use':
        setErrorMsg('An account with this email already exists.');
        break;
      case 'auth/weak-password':
        setErrorMsg('Password should be at least 6 characters.');
        break;
      case 'auth/invalid-email':
        setErrorMsg('Please enter a valid email address.');
        break;
      case 'auth/too-many-requests':
        setErrorMsg('Too many attempts. Please try again later.');
        break;
      case 'auth/popup-closed-by-user':
        setErrorMsg('Sign in cancelled.');
        break;
      case 'auth/popup-blocked':
        setErrorMsg('Popup was blocked by your browser. Please allow popups and try again.');
        break;
      case 'auth/network-request-failed':
        setErrorMsg('No internet connection.');
        break;
      case 'auth/cancelled-popup-request':
        setErrorMsg('Sign in was cancelled.');
        break;
      case 'auth/unauthorized-domain':
        setErrorMsg('This domain is not authorized for sign in.');
        break;
      default:
        setErrorMsg(`Something went wrong: ${error.message || 'Please try again.'}`);
    }
  };

  const clearError = () => setErrorMsg('');

  return (
    <main id="main" className="min-h-screen bg-slate-50 flex flex-col">
      {/* Hero Section */}
      <div className="bg-[#1B3A6B] px-4 py-8 relative overflow-hidden">
        <div className="max-w-md mx-auto text-center">
          {/* DIT logo */}
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2 shadow-sm">
            <img
              src="/icons/dit_logo.jpg"
              alt="DIT University logo"
              className="h-full w-full object-contain object-center"
            />
          </div>
          
          {/* App Title */}
          <h1 className="text-white font-bold text-[22px] mb-1">DIT Campus Map</h1>
          <p className="text-[#93B8E8] text-[13px]">DIT University, Dehradun</p>
        </div>
      </div>

      {/* White Card Section */}
      <div className="flex-1 bg-white">
        <div className="max-w-md mx-auto p-6">
          {/* Tab Switcher */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            <button
              onClick={() => setActiveTab('signin')}
              className={`flex-1 py-2 px-3 rounded-md transition-all ${
                activeTab === 'signin' 
                  ? 'bg-white shadow-sm text-[#1B3A6B] font-semibold' 
                  : 'text-gray-600'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setActiveTab('signup')}
              className={`flex-1 py-2 px-3 rounded-md transition-all ${
                activeTab === 'signup' 
                  ? 'bg-white shadow-sm text-[#1B3A6B] font-semibold' 
                  : 'text-gray-600'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {errorMsg}
            </div>
          )}

          {/* Sign In Form */}
          {activeTab === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1B3A6B] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1B3A6B] focus:border-transparent"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#1B3A6B] text-white py-3 rounded-lg font-semibold hover:bg-[#2A4A8B] transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {/* Sign Up Form */}
          {activeTab === 'signup' && (
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1B3A6B] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1B3A6B] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1B3A6B] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1B3A6B] focus:border-transparent"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#1B3A6B] text-white py-3 rounded-lg font-semibold hover:bg-[#2A4A8B] transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}

          {/* Google Sign In */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>
            <button
              onClick={handleGoogleSignIn}
              disabled={isSubmitting}
              className="w-full mt-4 flex items-center justify-center gap-2 border border-gray-300 py-3 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Guest Mode */}
          <div className="mt-6 text-center">
            <p className="text-gray-600 text-sm">
              Browse without account · 
              <button
                type="button"
                onClick={onGuest}
                className="text-[#1B3A6B] font-semibold hover:underline ml-1"
              >
                Continue as guest
              </button>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
