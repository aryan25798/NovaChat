import React, { useState, useRef } from "react";
import { Avatar } from "../components/ui/Avatar";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { BsCamera, BsCheck } from "react-icons/bs";
import { IoArrowBack } from "react-icons/io5";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { uploadProfilePhoto } from "../services/authService";
import { motion } from "framer-motion";

const ProfilePage = () => {
    const { currentUser, deactivateAccount } = useAuth();
    const [name, setName] = useState(currentUser?.displayName || "");
    const [about, setAbout] = useState(currentUser?.about || "Hey there! I am using WhatsApp.");
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleSave = async () => {
        if (!currentUser) return;
        setSaving(true);
        try {
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, {
                displayName: name,
                about: about
            });
            setTimeout(() => setSaving(false), 500);
        } catch (error) {
            console.error("Error updating profile:", error);
            setSaving(false);
        }
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !currentUser) return;

        setUploading(true);
        try {
            await uploadProfilePhoto(currentUser.uid, file);
        } catch (err) {
            console.error("Error uploading photo:", err);
            alert("Failed to upload photo. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background md:max-w-md md:mx-auto md:border-x md:border-border">
            {/* Header */}
            <div className="flex items-center gap-2 xs:gap-4 p-4 bg-muted/30 border-b border-border sticky top-0 z-10 backdrop-blur-md">
                <Link to="/" className="text-primary hover:bg-muted p-2 rounded-full transition-colors">
                    <IoArrowBack className="w-5 h-5 xs:w-6 xs:h-6" />
                </Link>
                <h1 className="text-lg xs:text-xl font-semibold">Profile</h1>
            </div>

            <div className="flex-1 overflow-y-auto px-4 xs:px-6 py-6 space-y-6 xs:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 no-scrollbar">
                {/* Avatar Section */}
                <div className="flex flex-col items-center gap-4">
                    <div
                        className="relative group cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Avatar
                            src={currentUser?.photoURL}
                            alt="Profile"
                            className="h-32 w-32 xs:h-40 xs:w-40 border-4 border-background shadow-lg transition-transform active:scale-95"
                        />
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                            <BsCamera className="w-8 h-8 xs:w-10 xs:h-10 text-white mb-1" />
                            <span className="text-[10px] text-white font-bold">{uploading ? "UPLOADING..." : "CHANGE PHOTO"}</span>
                        </div>
                        {uploading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-full">
                                <span className="animate-spin h-8 w-8 border-3 border-white rounded-full border-t-transparent" />
                            </div>
                        )}
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        hidden
                        accept="image/*"
                        onChange={handlePhotoUpload}
                    />
                </div>

                {/* Info Section */}
                <div className="space-y-6">
                    <div className="space-y-1">
                        <label className="text-[10px] xs:text-xs font-bold text-whatsapp-teal uppercase tracking-wider">Your Name</label>
                        <div className="flex items-center gap-2 border-b border-border pb-1 xs:pb-2 focus-within:border-whatsapp-teal transition-colors">
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="border-none shadow-none px-0 text-base xs:text-lg focus-visible:ring-0 bg-transparent h-9 xs:h-11"
                                placeholder="Enter your name"
                            />
                            <div onClick={handleSave} className="cursor-pointer p-2 hover:bg-muted/50 rounded-full transition-colors flex shrink-0">
                                {saving ? (
                                    <span className="animate-spin h-4 w-4 border-2 border-whatsapp-teal rounded-full border-t-transparent" />
                                ) : (
                                    <BsCheck className="text-whatsapp-teal w-5 h-5 xs:w-6 xs:h-6" />
                                )}
                            </div>
                        </div>
                        <p className="text-[10px] xs:text-[11px] text-muted-foreground leading-tight pt-1">
                            This is not your username or pin. This name will be visible to your WhatsApp contacts.
                        </p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] xs:text-xs font-bold text-whatsapp-teal uppercase tracking-wider">About</label>
                        <div className="flex items-center gap-2 border-b border-border pb-1 xs:pb-2 focus-within:border-whatsapp-teal transition-colors">
                            <Input
                                value={about}
                                onChange={(e) => setAbout(e.target.value)}
                                className="border-none shadow-none px-0 text-[14px] xs:text-base focus-visible:ring-0 bg-transparent h-9 xs:h-11"
                                placeholder="Enter an status"
                            />
                            <div onClick={handleSave} className="cursor-pointer p-2 hover:bg-muted/50 rounded-full transition-colors flex shrink-0">
                                <BsCheck className="text-whatsapp-teal w-5 h-5 xs:w-6 xs:h-6" />
                            </div>
                        </div>
                    </div>

                    <div className="pt-8 pb-10 border-t border-border mt-8">
                        <Button
                            variant="destructive"
                            className="w-full rounded-xl h-12 font-bold shadow-sm active:scale-95 transition-transform"
                            onClick={async () => {
                                if (window.confirm("REQUEST ACCOUNT DELETION? This will flag your account for permanent removal by an administrator and log you out. This action cannot be undone once processed.")) {
                                    try {
                                        setSaving(true);
                                        await deactivateAccount();
                                    } catch (e) {
                                        alert("Request failed: " + e.message);
                                        setSaving(false);
                                    }
                                }
                            }}
                            disabled={saving}
                        >
                            {saving ? "REQUESTING..." : "DELETE ACCOUNT"}
                        </Button>
                        <p className="text-[10px] text-center text-muted-foreground mt-4 leading-relaxed uppercase tracking-widest font-bold opacity-50">
                            Nova Messaging v1.2.0<br />End-to-End Encrypted
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
