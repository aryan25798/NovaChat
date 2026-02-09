import React, { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import { useAuth } from "../contexts/AuthContext";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export default function Home() {
    const [selectedChat, setSelectedChat] = useState(null);
    const { currentUser } = useAuth();

    // Update presence periodically? or just relying on AuthContext logic
    // Added cleanup on unmount if needed

    return (
        <div className="app-container">
            <div className="green-bg"></div>
            <div className="main-window">
                <Sidebar setSelectedChat={setSelectedChat} selectedChat={selectedChat} />
                {selectedChat ? (
                    <ChatWindow chat={selectedChat} setChat={setSelectedChat} />
                ) : (
                    <div className="empty-state">
                        <div className="intro-img">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/512px-WhatsApp.svg.png" style={{ width: '100px', opacity: 0.6 }} alt="WhatsApp" />
                        </div>
                        <h1>WhatsApp Web</h1>
                        <p>Send and receive messages without keeping your phone online.<br />Use WhatsApp on up to 4 linked devices and 1 phone.</p>
                        <div className="encrypted-msg"><span className="lock-icon">🔒</span> End-to-end encrypted</div>
                    </div>
                )}
            </div>

            <style>{`
         .app-container {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            width: 100vw;
            position: relative;
            background: #f0f2f5;
         }
         .green-bg {
            position: absolute;
            top: 0;
            width: 100%;
            height: 127px;
            background-color: var(--teal-green);
            z-index: 0;
         }
         .main-window {
            display: flex;
            width: 100%;
            height: 100%;
            max-width: 1600px;
            background-color: #f0f2f5;
            z-index: 1;
            box-shadow: 0 17px 50px 0 rgba(11,20,26,.19), 0 12px 15px 0 rgba(11,20,26,.24);
            overflow: hidden;
            position: relative;
         }
         @media (min-width: 1441px) {
             .main-window {
                 height: calc(100% - 38px);
                 top: 19px;
                 width: calc(100% - 38px); 
             }
         }
         /* Mobile Responsiveness */
         @media (max-width: 768px) {
            .green-bg { display: none; }
            .app-container { background: #fff; }
            .main-window { width: 100%; height: 100%; box-shadow: none; max-width: none; top: 0; }
         }
         
         .empty-state {
            flex: 1;
            background-color: var(--header-bg);
            border-bottom: 6px solid var(--light-green); 
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            position: relative;
         }
         @media (max-width: 768px) {
             .empty-state { display: none; }
         }
         .intro-img img {
            width: 350px;
            opacity: 0.8;
         }
         .empty-state h1 {
            font-weight: 300;
            margin-top: 38px;
            color: var(--text-secondary);
            font-size: 32px;
         }
         .empty-state p {
            margin-top: 18px;
            font-size: 14px;
            color: var(--text-secondary);
            line-height: 20px;
            max-width: 450px;
         }
         .encrypted-msg {
            position: absolute;
            bottom: 40px;
            font-size: 14px;
            color: var(--text-lighter);
            display: flex;
            align-items: center;
            gap: 5px;
         }
       `}</style>
        </div>
    );
}
