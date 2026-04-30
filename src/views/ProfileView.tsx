import React, { useState } from 'react';
import { Mail, Shield, Bell, Check, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useAppContext } from '../core/store';

export default function ProfileView() {
  const { profile, updateProfile } = useAppContext();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editEmail, setEditEmail] = useState(profile.email);

  const handleSave = () => {
    updateProfile({ name: editName, email: editEmail });
    setIsEditing(false);
  };

  return (
    <div className="flex flex-col gap-10 pt-8 pb-32 max-w-[800px] mx-auto w-full">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Profile</h1>
        <p className="text-on-surface-variant text-lg">
          Manage your account details and preferences.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-start hover:bg-surface/50 p-8 rounded-3xl border border-outline transition-colors">
        <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-outline shrink-0">
          <img 
            alt="User profile" 
            className="w-full h-full object-cover" 
            src={profile.avatarUrl} 
          />
        </div>
        <div className="space-y-4 flex-1 w-full">
          {isEditing ? (
            <div className="space-y-4">
              <input 
                type="text" 
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-surface border border-outline rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-on-surface-variant"
                placeholder="Name"
              />
              <input 
                type="email" 
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full bg-surface border border-outline rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-on-surface-variant"
                placeholder="Email"
              />
              <div className="pt-2 flex gap-3">
                <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-primary text-background rounded-lg text-sm font-semibold transition-colors hover:opacity-90">
                  <Check className="w-4 h-4" /> Save
                </button>
                <button onClick={() => setIsEditing(false)} className="flex items-center gap-2 px-4 py-2 bg-surface text-on-background border border-outline hover:bg-surface-hover rounded-lg text-sm font-semibold transition-colors">
                  <X className="w-4 h-4" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-2xl font-bold">{profile.name}</h2>
                <p className="text-on-surface-variant flex items-center gap-2 mt-1">
                  <Mail className="w-4 h-4" /> {profile.email}
                </p>
              </div>
              <div className="pt-2 flex gap-3">
                <button 
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-surface text-on-background border border-outline hover:bg-surface-hover rounded-lg text-sm font-semibold transition-colors"
                >
                  Edit Profile
                </button>
                <button 
                  onClick={() => {
                    updateProfile({ name: 'Guest', email: 'guest@example.com' });
                  }}
                  className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-sm font-semibold transition-colors"
                >
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 border border-outline rounded-2xl bg-surface/30 space-y-4">
          <div className="flex items-center gap-3 text-primary">
            <Shield className="w-5 h-5" />
            <h3 className="font-semibold text-on-background">Security</h3>
          </div>
          <p className="text-sm text-on-surface-variant">Update your password and secure your account.</p>
          <button className="text-sm font-semibold text-on-background hover:text-primary transition-colors">Change Password</button>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="p-6 border border-outline rounded-2xl bg-surface/30 space-y-4">
          <div className="flex items-center gap-3 text-primary">
            <Bell className="w-5 h-5" />
            <h3 className="font-semibold text-on-background">Notifications</h3>
          </div>
          <p className="text-sm text-on-surface-variant">Manage your email and push notifications.</p>
          <button className="text-sm font-semibold text-on-background hover:text-primary transition-colors">Configure Settings</button>
        </motion.div>
      </div>
    </div>
  );
}
