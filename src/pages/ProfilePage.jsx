import React, { useState } from "react";
import { Avatar } from "../components/ui/Avatar";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { BsCamera, BsPen, BsCheck } from "react-icons/bs";
import { IoArrowBack } from "react-icons/io5";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

const ProfilePage = () => {
    const { currentUser } = useAuth();
    const [name, setName] = useState(currentUser?.displayName || "");
    const [about, setAbout] = useState(currentUser?.about || "Hey there! I am using WhatsApp.");
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!currentUser) return;
        setSaving(true);
        try {
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, {
                displayName: name,
                about: about
            });
            // Update local state if needed via AuthContext reload, but Firestore listener should handle it eventually
            // For feedback:
            setTimeout(() => setSaving(false), 500);
        } catch (error) {
            console.error("Error updating profile:", error);
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background md:max-w-md md:mx-auto md:border-x md:border-border">
            {/* Header */}
            <div className="flex items-center gap-4 p-4 bg-muted/30 border-b border-border">
                <Link to="/" className="text-primary hover:bg-muted p-2 rounded-full">
                    <IoArrowBack className="w-6 h-6" />
                </Link>
                <h1 className="text-xl font-semibold">Profile</h1>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Avatar Section */}
                <div className="flex flex-col items-center gap-4">
                    <div className="relative group cursor-pointer">
                        <Avatar src={currentUser?.photoURL} alt="Profile" className="h-40 w-40 border-4 border-background shadow-lg" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                            <BsCamera className="w-10 h-10 text-white" />
                        </div>
                    </div>
                </div>

                {/* Info Section */}
                <div className="space-y-6">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-whatsapp-teal uppercase">Your Name</label>
                        <div className="flex items-center gap-2 border-b border-border pb-2">
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="border-none shadow-none px-0 text-lg focus-visible:ring-0 bg-transparent"
                            />
                            <div onClick={handleSave} className="cursor-pointer p-2 hover:bg-gray-200 rounded-full transition-colors">
                                {saving ? <span className="animate-spin h-4 w-4 border-2 border-whatsapp-teal rounded-full border-t-transparent block" /> : <BsCheck className="text-whatsapp-teal w-6 h-6" />}
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            This is not your username or pin. This name will be visible to your WhatsApp contacts.
                        </p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-whatsapp-teal uppercase">About</label>
                        <div className="flex items-center gap-2 border-b border-border pb-2">
                            <Input
                                value={about}
                                onChange={(e) => setAbout(e.target.value)}
                                className="border-none shadow-none px-0 text-base focus-visible:ring-0 bg-transparent"
                            />
                            <div onClick={handleSave} className="cursor-pointer p-2 hover:bg-gray-200 rounded-full transition-colors">
                                <BsCheck className="text-whatsapp-teal w-6 h-6" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-whatsapp-teal uppercase">Email</label>
                        <div className="flex items-center gap-2 border-b border-border pb-2">
                            <p className="text-base text-gray-700 dark:text-gray-300 py-2">{currentUser?.email}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
