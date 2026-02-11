import { motion, AnimatePresence } from "framer-motion";
import { postStatus } from "../services/statusService";
import { useFileUpload } from "../hooks/useFileUpload";
import UploadProgress from "./chat/UploadProgress";

export default function StatusCreator({ onClose }) {
    const { currentUser } = useAuth();
    const [text, setText] = useState("");
    const { uploads, startUpload, clearCompleted } = useFileUpload();
    const [isFinalizing, setIsFinalizing] = useState(false);

    const handleFile = (e) => {
        if (e.target.files[0]) {
            setMediaFile(e.target.files[0]);
        }
    };

    const toggleColor = () => {
        const idx = colors.indexOf(bgColor);
        const next = colors[(idx + 1) % colors.length];
        setBgColor(next);
    };

    const handlePost = async () => {
        if (!text && !mediaFile) return;
        setLoading(true);

        try {
            const type = mediaFile ? (mediaFile.type.startsWith('video') ? 'video' : 'image') : 'text';
            let contentUrl = text;

            if (type !== 'text') {
                const { uploadTask } = await startUpload(mediaFile, `status/${currentUser.uid}/${Date.now()}_${mediaFile.name}`);

                // Wait for upload to complete
                await new Promise((resolve, reject) => {
                    uploadTask.on('state_changed', null, reject, async () => {
                        const url = await getDownloadURL(uploadTask.snapshot.ref);
                        contentUrl = url;
                        resolve();
                    });
                });
            }

            setIsFinalizing(true);
            await postStatus(
                currentUser,
                type,
                contentUrl,
                mediaFile ? text : "",
                type === 'text' ? bgColor : null
            );

            setLoading(false);
            onClose();
        } catch (err) {
            console.error("Error posting status:", err);
            setLoading(false);
            setIsFinalizing(false);
        }
    };

    return (
        <motion.div
            className="fixed inset-0 bg-background z-[100000] flex flex-col font-sans"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        >
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-5 z-20 flex justify-between items-start pointer-events-none">
                <div className="pointer-events-auto">
                    <button onClick={onClose} className="bg-black/20 backdrop-blur-md text-white/90 text-2xl cursor-pointer p-3 rounded-full hover:bg-black/30 transition-all shadow-sm">
                        <FaTimes />
                    </button>
                </div>
            </div>

            {mediaFile ? (
                // Media Preview Mode
                <div className="flex-1 flex flex-col bg-black relative">
                    <div className="flex-1 flex items-center justify-center p-4">
                        {mediaFile.type.startsWith('video') ?
                            <video src={URL.createObjectURL(mediaFile)} controls className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" /> :
                            <img src={URL.createObjectURL(mediaFile)} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" alt="Preview" />
                        }
                    </div>

                    {/* Caption Bar */}
                    <div className="p-4 px-6 pb-8 bg-black/80 backdrop-blur-xl flex items-center gap-4 border-t border-white/10">
                        <div className="flex-1 flex items-center gap-4 bg-white/10 rounded-3xl px-5 border border-white/5 focus-within:bg-white/15 transition-colors">
                            <FaSmile className="text-white/60 text-xl cursor-pointer hover:text-white transition-colors" />
                            <input
                                placeholder="Add a caption..."
                                value={text}
                                onChange={e => setText(e.target.value)}
                                className="flex-1 h-12 bg-transparent border-none outline-none text-white text-[15px] placeholder:text-white/40"
                            />
                        </div>
                        <button
                            className="w-12 h-12 rounded-full bg-primary border-0 text-white text-xl cursor-pointer flex items-center justify-center shadow-lg hover:bg-primary/90 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all"
                            onClick={handlePost}
                            disabled={loading}
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <FaPaperPlane className="ml-1" />
                            )}
                        </button>
                    </div>
                </div>
            ) : (
                // Text Status Mode
                <div
                    className="flex-1 flex flex-col items-center justify-center pb-24 transition-colors duration-500 relative"
                    style={{ background: bgColor }}
                >
                    <textarea
                        placeholder="Type a status"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        autoFocus
                        className="bg-transparent border-none outline-none text-white text-4xl md:text-5xl text-center w-[85%] resize-none font-medium placeholder:text-white/30 leading-tight drop-shadow-md selection:bg-white/30"
                        rows={5}
                    />

                    <div className="absolute bottom-0 left-0 right-0 p-6 pb-10 flex justify-between items-center bg-gradient-to-t from-black/40 via-black/20 to-transparent">
                        <div className="flex gap-4">
                            <button onClick={toggleColor} className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-md text-white text-lg flex items-center justify-center hover:bg-black/40 hover:scale-105 transition-all shadow-sm" title="Change Background">
                                <FaPalette />
                            </button>
                            <button onClick={() => fileInputRef.current.click()} className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-md text-white text-lg flex items-center justify-center hover:bg-black/40 hover:scale-105 transition-all shadow-sm" title="Add Media">
                                <FaImage />
                            </button>
                            <input type="file" ref={fileInputRef} hidden accept="image/*,video/*" onChange={handleFile} />
                        </div>

                        <button
                            className="w-14 h-14 rounded-full bg-[#00a884] border-0 text-white text-xl cursor-pointer flex items-center justify-center shadow-lg hover:bg-[#00906f] hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all"
                            onClick={handlePost}
                            disabled={!text || loading}
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <FaPaperPlane className="ml-1" />
                            )}
                        </button>
                    </div>
                </div>
            )}
            {/* Upload Overlay */}
            <UploadProgress
                uploads={uploads}
                onClear={clearCompleted}
                onPause={() => { }} onResume={() => { }} onCancel={() => { }}
            />

            {isFinalizing && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100001] flex items-center justify-center">
                    <div className="bg-surface p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
                        <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <p className="text-text-1 font-medium">Finishing up...</p>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
