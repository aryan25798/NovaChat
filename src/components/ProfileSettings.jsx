import React, { useState, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { updateUserProfile, uploadProfilePhoto } from "../services/authService";
import { db } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";
import { FaArrowLeft, FaCamera, FaPen, FaCheck, FaSignOutAlt } from "react-icons/fa";
import { motion } from "framer-motion";

export default function ProfileSettings({ onClose }) {
    const { currentUser, logout, toggleLocationSharing } = useAuth();
    const [name, setName] = useState(currentUser.displayName || "");
    const [about, setAbout] = useState(currentUser.about || "Hey there! I am using WhatsClone AI.");
    const [isEditingName, setIsEditingName] = useState(false);
    const [isEditingAbout, setIsEditingAbout] = useState(false);
    const [loading, setLoading] = useState(false);
    const [photoURL, setPhotoURL] = useState(currentUser.photoURL);

    // Ideally move privacy settings to a separate service, keeping local for now but clean
    const [lastSeenPrivacy, setLastSeenPrivacy] = useState(currentUser.privacy?.lastSeen || 'everyone');
    const [readReceipts, setReadReceipts] = useState(currentUser.privacy?.readReceipts !== false);

    const updatePrivacy = async (field, value) => {
        try {
            await updateDoc(doc(db, "users", currentUser.uid), {
                [`privacy.${field}`]: value
            });
            if (field === 'lastSeen') setLastSeenPrivacy(value);
            if (field === 'readReceipts') setReadReceipts(value);
        } catch (err) { console.error("Privacy update failed", err); }
    };

    const fileInputRef = useRef();

    const handleSaveName = async () => {
        if (!name.trim()) return;
        try {
            await updateUserProfile(currentUser.uid, { displayName: name });
            setIsEditingName(false);
        } catch (err) {
            console.error("Error updating name:", err);
        }
    };

    const handleSaveAbout = async () => {
        try {
            await updateUserProfile(currentUser.uid, { about: about });
            setIsEditingAbout(false);
        } catch (err) {
            console.error("Error updating status:", err);
        }
    }

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setLoading(true);
        try {
            const url = await uploadProfilePhoto(currentUser.uid, file);
            setPhotoURL(url);
        } catch (err) {
            console.error("Error uploading photo:", err);
        }
        setLoading(false);
    };

    const handleLogout = async () => {
        try {
            await logout();
            window.location.reload();
        } catch (err) {
            console.error("Failed to logout", err);
        }
    }

    return (
        <motion.div
            className="absolute inset-0 z-[200] flex flex-col bg-surface-elevated/50 backdrop-blur-3xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        >
            <div className="w-full max-w-3xl mx-auto h-full bg-surface-elevated flex flex-col relative shadow-2xl border-x border-border/50">
                {/* Header */}
                <div className="bg-surface-elevated/95 backdrop-blur-xl h-28 px-4 pb-4 flex items-end justify-between border-b border-border/50 shrink-0 shadow-sm relative z-10">
                    <div className="flex items-center gap-4 text-text-1">
                        <button onClick={onClose} aria-label="Back" className="text-xl hover:bg-surface p-2 rounded-full transition-colors">
                            <FaArrowLeft />
                        </button>
                        <h3 className="text-xl font-medium">Profile</h3>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pb-8 custom-scrollbar">
                    {/* Avatar Section */}
                    <div className="py-6 xs:py-10 flex justify-center bg-transparent">
                        <div className="relative w-[150px] h-[150px] xs:w-[200px] xs:h-[200px] rounded-full overflow-hidden cursor-pointer group shadow-2xl ring-4 ring-surface" onClick={() => fileInputRef.current.click()}>
                            <img src={photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.uid}`} alt="Profile" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-[10px] xs:text-xs font-medium opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm">
                                <FaCamera className="text-2xl xs:text-3xl mb-1 xs:mb-2" />
                                <span>{loading ? "UPLOADING..." : "CHANGE PHOTO"}</span>
                            </div>
                        </div>
                        <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handlePhotoUpload} />
                    </div>

                    {/* Name Section */}
                    <div className="bg-surface px-5 xs:px-8 py-4 xs:py-5 shadow-sm mb-2 border-y border-border/30">
                        <label className="text-primary text-[12px] xs:text-sm font-medium mb-2 xs:mb-3 block uppercase tracking-wider">Your name</label>
                        <div className="flex items-center justify-between min-h-[30px]">
                            {isEditingName ? (
                                <div className="w-full border-b-2 border-primary pb-1 flex items-center">
                                    <input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        autoFocus
                                        maxLength={25}
                                        className="w-full text-text-1 text-[16px] xs:text-[17px] bg-transparent outline-none placeholder:text-text-2/50"
                                    />
                                    <span className="text-[10px] text-text-2 mr-2 xs:mr-3">{25 - name.length}</span>
                                    <button onClick={handleSaveName} className="text-text-2 hover:text-primary transition-colors">
                                        <FaCheck className="text-lg" />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-full flex justify-between items-center group cursor-pointer" onClick={() => setIsEditingName(true)}>
                                    <span className="text-text-1 text-[16px] xs:text-[17px]">{name}</span>
                                    <button className="text-primary opacity-0 group-hover:opacity-100 transition-all">
                                        <FaPen />
                                    </button>
                                </div>
                            )}
                        </div>
                        {!isEditingName && <p className="text-[11px] xs:text-[13px] text-text-2 mt-2 xs:mt-3 leading-tight">This is not your username or pin. This name will be visible to your WhatsApp contacts.</p>}
                    </div>

                    {/* About Section */}
                    <div className="bg-surface px-5 xs:px-8 py-4 xs:py-5 shadow-sm mb-2 border-y border-border/30">
                        <label className="text-primary text-[12px] xs:text-sm font-medium mb-2 xs:mb-3 block uppercase tracking-wider">About</label>
                        <div className="flex items-center justify-between min-h-[30px]">
                            {isEditingAbout ? (
                                <div className="w-full border-b-2 border-primary pb-1 flex items-center">
                                    <input
                                        value={about}
                                        onChange={(e) => setAbout(e.target.value)}
                                        autoFocus
                                        maxLength={139}
                                        className="w-full text-text-1 text-[16px] xs:text-[17px] bg-transparent outline-none placeholder:text-text-2/50"
                                    />
                                    <span className="text-[10px] text-text-2 mr-2 xs:mr-3">{139 - about.length}</span>
                                    <button onClick={handleSaveAbout} className="text-text-2 hover:text-primary transition-colors">
                                        <FaCheck className="text-lg" />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-full flex justify-between items-center group cursor-pointer" onClick={() => setIsEditingAbout(true)}>
                                    <span className="text-text-1 text-[16px] xs:text-[17px] min-h-[1.5em]">{about}</span>
                                    <button className="text-primary opacity-0 group-hover:opacity-100 transition-all">
                                        <FaPen />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Privacy Section */}
                    <div className="bg-surface px-5 xs:px-8 py-4 xs:py-5 shadow-sm mb-2 mt-6 xs:mt-8 border-y border-border/30">
                        <div className="text-primary text-[12px] xs:text-sm font-medium mb-4 xs:mb-5 uppercase tracking-wider">Privacy</div>

                        <div className="flex justify-between items-center mb-4 xs:mb-6">
                            <div className="flex flex-col gap-0.5 xs:gap-1 overflow-hidden mr-2">
                                <span className="text-text-1 text-[15px] xs:text-[16px] truncate">Share Location</span>
                                <span className="text-text-2 text-[11px] xs:text-[13px] leading-tight">Share your login location for security</span>
                            </div>
                            <label className="relative inline-block w-[36px] xs:w-[40px] h-[22px] xs:h-[24px] shrink-0">
                                <input
                                    type="checkbox"
                                    checked={currentUser.locationSharingEnabled === true}
                                    onChange={(e) => toggleLocationSharing(e.target.checked)}
                                    className="opacity-0 w-0 h-0 peer"
                                />
                                <span className="absolute cursor-pointer top-0 left-0 right-0 bottom-0 bg-gray-300 dark:bg-gray-600 transition-all duration-300 rounded-full peer-checked:bg-primary before:absolute before:content-[''] before:h-[16px] xs:before:h-[18px] before:w-[16px] xs:before:w-[18px] before:left-[3px] before:bottom-[3px] before:bg-white before:transition-all before:duration-300 before:rounded-full peer-checked:before:translate-x-[14px] xs:peer-checked:before:translate-x-[16px] shadow-inner"></span>
                            </label>
                        </div>

                        <div className="flex justify-between items-center mb-4 xs:mb-6">
                            <div className="flex flex-col gap-0.5 xs:gap-1 overflow-hidden mr-2">
                                <span className="text-text-1 text-[15px] xs:text-[16px] truncate">Last Seen</span>
                                <span className="text-text-2 text-[11px] xs:text-[13px] leading-tight">Who can see when you're online</span>
                            </div>
                            <select
                                value={lastSeenPrivacy}
                                onChange={(e) => updatePrivacy('lastSeen', e.target.value)}
                                className="p-1.5 xs:p-2 border border-border rounded-lg text-[12px] xs:text-sm text-text-1 bg-surface-elevated outline-none focus:border-primary transition-colors cursor-pointer shrink-0"
                            >
                                <option value="everyone">Everyone</option>
                                <option value="nobody">Nobody</option>
                            </select>
                        </div>

                        <div className="flex justify-between items-center">
                            <div className="flex flex-col gap-0.5 xs:gap-1 overflow-hidden mr-2">
                                <span className="text-text-1 text-[15px] xs:text-[16px] truncate">Read Receipts</span>
                                <span className="text-text-2 text-[11px] xs:text-[13px] leading-tight">If turned off, you won't send receipts.</span>
                            </div>
                            <label className="relative inline-block w-[36px] xs:w-[40px] h-[22px] xs:h-[24px] shrink-0">
                                <input
                                    type="checkbox"
                                    checked={readReceipts}
                                    onChange={(e) => updatePrivacy('readReceipts', e.target.checked)}
                                    className="opacity-0 w-0 h-0 peer"
                                />
                                <span className="absolute cursor-pointer top-0 left-0 right-0 bottom-0 bg-gray-300 dark:bg-gray-600 transition-all duration-300 rounded-full peer-checked:bg-primary before:absolute before:content-[''] before:h-[16px] xs:before:h-[18px] before:w-[16px] xs:before:w-[18px] before:left-[3px] before:bottom-[3px] before:bg-white before:transition-all before:duration-300 before:rounded-full peer-checked:before:translate-x-[14px] xs:peer-checked:before:translate-x-[16px] shadow-inner"></span>
                            </label>
                        </div>
                    </div>

                    {/* Logout */}
                    <div className="bg-surface px-8 py-4 shadow-sm mt-6 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors cursor-pointer flex items-center gap-4 text-base font-medium border-y border-border/30" onClick={handleLogout}>
                        <FaSignOutAlt />
                        <span>Log out</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
