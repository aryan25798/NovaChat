import React, { useState, useRef, useEffect } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { BsEmojiSmile, BsMic, BsPlus } from "react-icons/bs";
import { IoSend } from "react-icons/io5";
import { FaTimes } from "react-icons/fa";

const ChatInput = ({ onSendMessage }) => {
    const [message, setMessage] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);

    const handleSend = () => {
        if (message.trim()) {
            onSendMessage(message, 'text');
            setMessage("");
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.type.startsWith('image/')) {
                onSendMessage("", 'image', file);
            }
            e.target.value = null;
        }
    };

    const triggerFileSelect = () => {
        fileInputRef.current?.click();
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], "voice_note.webm", { type: 'audio/webm' });
                onSendMessage("", 'audio', audioFile); // Send audio file
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (error) {
            console.error("Error accessing microphone:", error);
            alert("Microphone access is required to record voice notes.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
        <div className="flex items-end gap-2 p-2 bg-input-background border-t border-border bg-gray-100 dark:bg-gray-800">
            {isRecording ? (
                <div className="flex-1 flex items-center gap-4 px-4 py-2 bg-white dark:bg-gray-700 rounded-lg shadow-sm">
                    <span className="text-red-500 animate-pulse">●</span>
                    <span className="text-gray-700 dark:text-gray-200 font-mono">{formatTime(recordingTime)}</span>
                    <div className="flex-1 text-center text-sm text-gray-500">Recording...</div>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50" onClick={() => {
                        // Cancel logic: stop stream but don't send
                        if (mediaRecorderRef.current) {
                            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
                            setIsRecording(false);
                            clearInterval(timerRef.current);
                        }
                    }}>
                        <FaTimes />
                    </Button>
                    <Button size="icon" className="bg-whatsapp-teal text-white rounded-full" onClick={stopRecording}>
                        <IoSend className="w-4 h-4" />
                    </Button>
                </div>
            ) : (
                <>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                    <Button variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700" onClick={triggerFileSelect}>
                        <BsPlus className="w-6 h-6" />
                    </Button>

                    <div className="flex-1 rounded-lg bg-white dark:bg-gray-700 flex items-center px-4 py-2 shadow-sm border border-gray-200 dark:border-gray-600 focus-within:ring-1 focus-within:ring-whatsapp-tea transition-all">
                        <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 h-6 w-6 mr-2 p-0">
                            <BsEmojiSmile className="w-5 h-5" />
                        </Button>
                        <input
                            ref={inputRef}
                            type="text"
                            className="flex-1 bg-transparent border-none outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-400 text-sm max-h-32 overflow-y-auto"
                            placeholder="Type a message"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                    </div>

                    {message.trim() ? (
                        <Button onClick={handleSend} size="icon" className="bg-whatsapp-teal hover:bg-whatsapp-dark text-white rounded-full transition-transform transform hover:scale-105 shadow-md">
                            <IoSend className="w-5 h-5 pl-1" />
                        </Button>
                    ) : (
                        <Button variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full" onClick={startRecording}>
                            <BsMic className="w-5 h-5" />
                        </Button>
                    )}
                </>
            )}
        </div>
    );
};

export default ChatInput;
