// WebXR Coupon Hunt - Following Official Google WebXR Patterns
// Based on: https://developers.google.com/ar/develop/webxr/hello-webxr

let xrSession = null;
let xrReferenceSpace = null;
let xrHitTestSource = null;
let xrViewerSpace = null;

// Three.js components
let scene, camera, renderer;
let coupon;
let couponPlaced = false;
let couponCollected = false;

// Fixed coupons system
let coupons = [];
let maxCoupons = 4; // Fixed 4 coupons for focused experience
let couponsInitialized = false;

// Game state
let focusStartTime = null;
let requiredFocusTime = 5000; // 5 seconds for focus collection
let gameActive = false;
let navigationHandled = false;

// Time tracking
let gameStartTime = null;
let gameEndTime = null;

// 30-second challenge
let challengeTimer = null;
let challengeStartTime = null;
const CHALLENGE_DURATION_SECONDS = 30; // Single source of truth for timer
let challengeTimeLimit = CHALLENGE_DURATION_SECONDS * 1000; // Convert to milliseconds
let challengeActive = false;
let challengeFailed = false;

// Format completion time
function getCompletionTime() {
    if (!gameStartTime || !gameEndTime) {
        return 'Unknown';
    }
    
    const totalSeconds = Math.floor((gameEndTime - gameStartTime) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    const formattedTime = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    console.log('Formatted completion time:', formattedTime);
    
    return formattedTime;
}

// Start 30-second challenge timer
function startChallengeTimer() {
    if (challengeActive || challengeFailed) return;
    
    challengeActive = true;
    challengeStartTime = Date.now();
    gameStartTime = Date.now(); // Set game start time when challenge begins
    
    updateCollectionStatus(`${CHALLENGE_DURATION_SECONDS} seconds to collect all treasures!`);
    
    // Activate countdown timer with green color
    const countdownTimer = document.getElementById('countdown-timer');
    if (countdownTimer) {
        countdownTimer.classList.add('active');
        // Immediately set to green for 30 seconds
        countdownTimer.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.9), rgba(139, 195, 74, 0.8))';
        countdownTimer.style.animation = 'none';
        countdownTimer.style.borderColor = 'rgba(139, 195, 74, 0.5)';
    }
    
    // Update countdown every second
    const countdownInterval = setInterval(() => {
        if (!challengeActive) {
            clearInterval(countdownInterval);
            return;
        }
        
        const remaining = getRemainingChallengeTime();
        updateCountdownDisplay(remaining);
        
        if (remaining <= 0) {
            clearInterval(countdownInterval);
        }
    }, 100); // Update every 100ms for smooth countdown
    
    // Set timeout for failure
    challengeTimer = setTimeout(() => {
        console.log('Challenge timer expired!');
        console.log('Challenge active:', challengeActive);
        console.log('Coupons collected:', getCouponsCollected());
        console.log('Max coupons:', maxCoupons);
        
        if (challengeActive && getCouponsCollected() < maxCoupons) {
            console.log('Challenge failed - showing failure screen immediately');
            challengeFailed = true;
            challengeActive = false;
            
            // Deactivate countdown timer
            const countdownTimer = document.getElementById('countdown-timer');
            if (countdownTimer) {
                countdownTimer.classList.remove('active');
                updateCountdownDisplay(CHALLENGE_DURATION_SECONDS); // Reset to timer value
            }
            
            // Show failure screen immediately (don't end XR session first)
            console.log('Calling showFailureScreen immediately');
            showFailureScreen();
            
            // End XR session after showing failure screen
            setTimeout(() => {
                if (xrSession) {
                    console.log('Ending XR session after failure screen shown');
                    xrSession.end();
                }
            }, 100);
        } else {
            console.log('Challenge timer expired but conditions not met for failure');
        }
    }, challengeTimeLimit);
}

// Stop challenge timer
function stopChallengeTimer() {
    if (challengeTimer) {
        clearTimeout(challengeTimer);
        challengeTimer = null;
    }
    challengeActive = false;
    
    // Deactivate countdown timer
    const countdownTimer = document.getElementById('countdown-timer');
    if (countdownTimer) {
        countdownTimer.classList.remove('active');
        updateCountdownDisplay(CHALLENGE_DURATION_SECONDS); // Reset to timer value
    }
}

// Update countdown display
function updateCountdownDisplay(seconds) {
    const countdownNumber = document.getElementById('countdown-number');
    if (countdownNumber) {
        // Format seconds to show 2 digits for active countdown, normal for inactive
        const displaySeconds = Math.max(0, seconds);
        if (seconds > 0 && seconds < 10) {
            countdownNumber.textContent = `0${displaySeconds}`;
        } else {
            countdownNumber.textContent = displaySeconds.toString();
        }
        
        // Change color based on remaining time with smooth transitions
        const countdownTimer = document.getElementById('countdown-timer');
        if (countdownTimer && seconds > 0) {
            if (seconds <= 10) {
                // RED: Final 10 seconds - urgent!
                countdownTimer.style.background = 'linear-gradient(135deg, rgba(255, 59, 59, 0.95), rgba(255, 79, 79, 0.9))';
                countdownTimer.style.animation = 'none';
                countdownTimer.style.borderColor = 'rgba(255, 100, 100, 0.6)';
            } else if (seconds <= 20) {
                // YELLOW: 20-10 seconds - warning!
                countdownTimer.style.background = 'linear-gradient(135deg, rgba(255, 193, 7, 0.9), rgba(255, 235, 59, 0.8))';
                countdownTimer.style.animation = 'none';
                countdownTimer.style.borderColor = 'rgba(255, 235, 59, 0.5)';
            } else {
                // GREEN: 30-20 seconds - all good!
                countdownTimer.style.background = 'linear-gradient(135deg, rgba(76, 175, 80, 0.9), rgba(139, 195, 74, 0.8))';
                countdownTimer.style.animation = 'none';
                countdownTimer.style.borderColor = 'rgba(139, 195, 74, 0.5)';
            }
        } else if (countdownTimer && (seconds === 0 || seconds === 30)) {
            // Reset to inactive state
            countdownTimer.style.background = '';
            countdownTimer.style.animation = '';
            countdownTimer.style.borderColor = '';
        }
    }
}

// Get remaining challenge time
function getRemainingChallengeTime() {
    if (!challengeActive || !challengeStartTime) return 0;
    
    const elapsed = Date.now() - challengeStartTime;
    const remaining = Math.max(0, challengeTimeLimit - elapsed);
    return Math.ceil(remaining / 1000);
}

async function activateXR() {
    try {
        setupNavigationHandling();
        showLoading('Starting WebXR...');
        
        if (!navigator.xr) {
            throw new Error('WebXR not supported in this browser. Please use Chrome on an ARCore-compatible device.');
        }
        
        // Check if immersive AR is supported with detailed error handling
        let isARSupported = false;
        try {
            isARSupported = await navigator.xr.isSessionSupported('immersive-ar');
            console.log('Immersive AR support check result:', isARSupported);
        } catch (supportError) {
            console.error('Error checking AR support:', supportError);
            throw new Error(`Failed to check AR support: ${supportError.message}`);
        }
        
        if (!isARSupported) {
            throw new Error('Immersive AR not supported on this device. Please ensure ARCore is installed and updated.');
        }
        
        // Add a canvas element and initialize a WebGL context that is compatible with WebXR
        const canvas = document.getElementById('ar-canvas');
        if (!canvas) {
            throw new Error('AR canvas element not found. Please check HTML structure.');
        }
        
        const gl = canvas.getContext("webgl", {xrCompatible: true});
        if (!gl) {
            throw new Error('WebGL not supported or failed to create XR-compatible context');
        }
        
        // Initialize Three.js scene
        initThreeJS(canvas, gl);
        
        // Initialize a WebXR session using "immersive-ar" with container UI
        xrSession = await navigator.xr.requestSession("immersive-ar", {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.getElementById('ar-container-view') }
        });
        
        xrSession.updateRenderState({
            baseLayer: new XRWebGLLayer(xrSession, gl)
        });
        
        // A 'local' reference space has a native origin that is located
        // near the viewer's position at the time the session was created
        xrReferenceSpace = await xrSession.requestReferenceSpace('local');
        
        // Create another XRReferenceSpace that has the viewer as the origin
        xrViewerSpace = await xrSession.requestReferenceSpace('viewer');
        
        // Perform hit testing using the viewer as origin (if supported)
        try {
            xrHitTestSource = await xrSession.requestHitTestSource({ 
                space: xrViewerSpace 
            });
        } catch (hitTestError) {
            xrHitTestSource = null;
        }
        
        // Load 3D models
        await loadModels();
        
        gameActive = true;
        // Note: gameStartTime is now set when challenge begins (when treasures appear)
        
        // Hide loading and show AR container view with null checks
        hideLoading();
        const startScreen = document.getElementById('start-screen');
        const arContainerView = document.getElementById('ar-container-view');
        
        if (startScreen) startScreen.style.display = 'none';
        if (arContainerView) arContainerView.style.display = 'block';
        
        // Initialize UI
        updateCollectionStatus('Point camera at floor to find treasures.');
        updateCollectionCounter();
        
        // Setup AR sound toggle
        setupARSoundToggle();
        
        // Start background music for AR session
        startGameAudio();
        
        // Setup session end handling
        xrSession.addEventListener('end', onSessionEnd);
        
        // Add click/tap event listener for coupon collection
        xrSession.addEventListener('select', onSelect);
        
        // Create a render loop that allows us to draw on the AR view
        xrSession.requestAnimationFrame(onXRFrame);
        
    } catch (error) {
        console.error('WebXR activation failed:', error);
        hideLoading();
        
        // Provide specific error messages based on error type
        let errorMessage = error.message;
        
        if (error.name === 'NotSupportedError') {
            errorMessage = 'WebXR AR not supported on this device. Please use a Pixel 8 or other ARCore-compatible device with Chrome browser.';
        } else if (error.name === 'NotAllowedError') {
            errorMessage = 'Camera permission denied. Please allow camera access and try again.';
        } else if (error.name === 'SecurityError') {
            errorMessage = `Security Error: ${error.message}. Please ensure you're using a compatible browser and device.`;
        } else if (error.message.includes('request session')) {
            errorMessage = 'Failed to create WebXR session. Please ensure ARCore is installed and Chrome is updated to the latest version.';
        }
        
        showError(errorMessage);
    }
}

function initThreeJS(canvas, gl) {
    // Initialize Three.js scene following Google WebXR patterns
    scene = new THREE.Scene();
    
    // Add lighting as per Google WebXR documentation
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight.position.set(10, 15, 10);
    scene.add(directionalLight);
    
    // Add ambient light for better visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    // Set up the WebGLRenderer following Google WebXR patterns
    renderer = new THREE.WebGLRenderer({
        alpha: true,
        preserveDrawingBuffer: true,
        canvas: canvas,
        context: gl
    });
    renderer.autoClear = false; // CRITICAL: As per Google WebXR documentation
    
    // The API directly updates the camera matrices.
    // Disable matrix auto updates so three.js doesn't attempt
    // to handle the matrices independently.
    camera = new THREE.PerspectiveCamera();
    camera.matrixAutoUpdate = false; // CRITICAL: As per Google WebXR documentation
    
    // Clean initialization without test objects
    

}



async function loadModels() {
    const loader = new THREE.GLTFLoader();
    
    // Create targeting reticle
    const reticleGeometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const reticleMaterial = new THREE.MeshBasicMaterial({
        color: 0x8a2be2,
        transparent: true,
        opacity: 0.8
    });
    reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    
    // Create coupon with SVG texture
    const textureLoader = new THREE.TextureLoader();
    const couponTexture = await new Promise((resolve, reject) => {
        textureLoader.load('assets/coupon.svg', resolve, undefined, reject);
    });
    
    // Create main coupon (original system)
    const couponGeometry = new THREE.PlaneGeometry(0.1, 0.07);
    const couponMaterial = new THREE.MeshLambertMaterial({
        color: 0x8a2be2,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
    });
    
    coupon = new THREE.Mesh(couponGeometry, couponMaterial);
    coupon.visible = false;
    coupon.castShadow = true;  // Set on mesh, not material
    coupon.receiveShadow = true;  // Set on mesh, not material
    scene.add(coupon);
    
    // Load only reticle and coupon models
    loadCouponModels();
}

// Clean coupon-only loading (no reticle needed)
function loadCouponModels() {
    // No models needed - coupons are created procedurally
}

// Create SVG-based coupon objects
function createCoupon(index, position) {
    
    // Load SVG texture for coupon with high quality settings
    const textureLoader = new THREE.TextureLoader();
    const couponTexture = textureLoader.load('assets/coupon.svg');
    
    // Improve SVG texture quality
    couponTexture.generateMipmaps = false;
    couponTexture.minFilter = THREE.LinearFilter;
    couponTexture.magFilter = THREE.LinearFilter;
    couponTexture.format = THREE.RGBAFormat;
    
    // Create coupon geometry with SVG texture (much bigger)
    const couponGeometry = new THREE.PlaneGeometry(0.4, 0.3); // Much larger for better visibility
    const couponMaterial = new THREE.MeshLambertMaterial({
        map: couponTexture,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide
    });
    
    const newCoupon = new THREE.Mesh(couponGeometry, couponMaterial);
    newCoupon.position.copy(position);
    newCoupon.position.y += 0.2; // Float higher above surface for bigger coupons
    
    // Add floating animation data
    newCoupon.userData = {
        type: 'coupon',
        value: Math.floor(Math.random() * 50) + 10, // 10-60% discount
        startY: newCoupon.position.y,
        floatOffset: Math.random() * Math.PI * 2,
        rotationSpeed: 0.005 + Math.random() * 0.01, // Slower rotation for SVG visibility
        index: index,
        collected: false
    };
    
    newCoupon.castShadow = true;  // Correct - set on mesh
    newCoupon.receiveShadow = true;  // Correct - set on mesh
    
    return newCoupon;
}

// Initialize 4 fixed bigger coupons at game start
function initializeCoupons(hitTestResults) {
    if (couponsInitialized || hitTestResults.length === 0) return;
    
    const hitPose = hitTestResults[0].getPose(xrReferenceSpace);
    
    // Create 4 fixed positions in a square pattern around the detected surface
    const positions = [
        new THREE.Vector3(
            hitPose.transform.position.x + 1.0,
            hitPose.transform.position.y + 0.3,
            hitPose.transform.position.z + 1.0
        ),
        new THREE.Vector3(
            hitPose.transform.position.x - 1.0,
            hitPose.transform.position.y + 0.3,
            hitPose.transform.position.z + 1.0
        ),
        new THREE.Vector3(
            hitPose.transform.position.x + 1.0,
            hitPose.transform.position.y + 0.3,
            hitPose.transform.position.z - 1.0
        ),
        new THREE.Vector3(
            hitPose.transform.position.x - 1.0,
            hitPose.transform.position.y + 0.3,
            hitPose.transform.position.z - 1.0
        )
    ];
    
    // Create all 4 big coupons at once
    positions.forEach((position, index) => {
        const newCoupon = createCoupon(index, position);
        if (newCoupon) {
            scene.add(newCoupon);
            coupons.push(newCoupon);
        }
    });
    
    couponsInitialized = true;
    
    // Initialize counter display
    updateCollectionCounter();
    
    // Start the 30-second challenge timer
    startChallengeTimer();
    
    // Update status when coupons are initialized
    updateCollectionStatus(`${CHALLENGE_DURATION_SECONDS} seconds to collect all treasures!`);
}

// Animate all coupons
function animateCoupons(time) {
    coupons.forEach((couponObj, index) => {
        if (!couponObj.userData || couponObj.userData.collected) return;
        
        // Floating animation
        const floatSpeed = 0.002;
        const floatAmount = 0.03;
        couponObj.position.y = couponObj.userData.startY + 
            Math.sin(time * floatSpeed + couponObj.userData.floatOffset) * floatAmount;
        
        // Rotation animation
        couponObj.rotation.y += couponObj.userData.rotationSpeed;
        couponObj.rotation.z += couponObj.userData.rotationSpeed * 0.5;
        
        // Remove coupons that are too far from camera
        const distance = couponObj.position.distanceTo(camera.position);
        if (distance > 10) {
            scene.remove(couponObj);
            coupons.splice(index, 1);
            console.log(`Removed distant coupon. Remaining: ${coupons.length}`);
        }
    });
}

// Click/tap-based coupon collection system
function onSelect(event) {
    console.log('Navi Quest onSelect triggered!');
    
    if (!couponsInitialized || coupons.length === 0) {
        console.log('Navi Quest initialized successfully');
        return;
    }
    
    console.log('Coupons available:', coupons.length);
    
    // Get the input source that triggered the select event
    const inputSource = event.inputSource;
    if (!inputSource) {
        console.log('No input source');
        return;
    }
    
    // Get the current frame
    const frame = event.frame;
    if (!frame) {
        console.log('No frame');
        return;
    }
    
    // Get the pose of the input source
    const pose = frame.getPose(inputSource.targetRaySpace, xrReferenceSpace);
    if (!pose) {
        console.log('No pose');
        return;
    }
    
    // Create a raycaster from the controller position and direction
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3(
        pose.transform.position.x,
        pose.transform.position.y,
        pose.transform.position.z
    );
    
    // Get direction from transform matrix
    const direction = new THREE.Vector3(
        -pose.transform.matrix[8],
        -pose.transform.matrix[9],
        -pose.transform.matrix[10]
    ).normalize();
    
    raycaster.set(origin, direction);
    
    // Check for intersections with uncollected coupons
    const uncollectedCoupons = coupons.filter(c => !c.userData.collected && c.visible);
    console.log('Uncollected coupons:', uncollectedCoupons.length);
    
    const intersects = raycaster.intersectObjects(uncollectedCoupons);
    console.log('Intersections found:', intersects.length);
    
    if (intersects.length > 0) {
        const clickedCoupon = intersects[0].object;
        console.log('Coupon clicked! Collecting coupon with index:', clickedCoupon.userData.index);
        collectMultipleCoupon(clickedCoupon, clickedCoupon.userData.index);
    } else {
        console.log('No coupon intersections found');
    }
}

// Collect a specific coupon from the multiple coupons array
function collectMultipleCoupon(couponObj, index) {
    console.log('Collecting treasure:', index, 'Current collected before:', getCouponsCollected());
    
    // Mark as collected
    couponObj.userData.collected = true;
    
    console.log('Treasure collected! Current count after:', getCouponsCollected());
    
    // Add collection effect
    const originalScale = couponObj.scale.x;
    couponObj.scale.setScalar(originalScale * 1.2);
    
    // Fade out animation
    const fadeOut = () => {
        couponObj.material.opacity -= 0.05;
        if (couponObj.material.opacity <= 0) {
            couponObj.visible = false;
            scene.remove(couponObj);
        } else {
            requestAnimationFrame(fadeOut);
        }
    };
    
    setTimeout(fadeOut, 200);
    
    // Play collection sound (with error handling)
    try {
        playCollectionSound();
    } catch (error) {
        console.log('Collection sound not available:', error.message);
    }
    
    // Update UI immediately (ensure this always runs)
    const collectedCount = getCouponsCollected();
    console.log('Updating UI with collected count:', collectedCount);
    updateCollectionStatus('Treasure found!');
    updateCollectionCounter();
    
    // Check if game is complete
    setTimeout(() => {
        checkGameCompletion();
    }, 500);
}

// Get count of collected coupons
function getCouponsCollected() {
    return coupons.filter(c => c.userData.collected).length;
}

// Get all collected coupon details
function getCollectedCouponDetails() {
    return coupons.filter(c => c.userData.collected).map(c => ({
        index: c.userData.index + 1,
        discount: c.userData.value
    }));
}

// Check if all coupons are collected and go to win page
function checkGameCompletion() {
    const collectedCount = getCouponsCollected();
    if (collectedCount === maxCoupons) {
        // Record completion time
        gameEndTime = Date.now();
        
        // Stop challenge timer - player succeeded!
        stopChallengeTimer();
        
        // End XR session first
        if (xrSession) {
            xrSession.end();
        }
        
        // Small delay then show win page
        setTimeout(() => {
            showWinPage();
        }, 1000);
    }
}

// Show win page with collected coupons
function showWinPage() {
    // Hide AR view and show start screen structure with null checks
    const arView = document.getElementById('ar-view');
    const arContainerView = document.getElementById('ar-container-view');
    const startScreen = document.getElementById('start-screen');
    
    if (arView) arView.style.display = 'none';
    if (arContainerView) arContainerView.style.display = 'none';
    if (startScreen) startScreen.style.display = 'none';
    
    // Create win page overlay
    const overlay = document.createElement('div');
    overlay.className = 'win-page-overlay';
    overlay.innerHTML = `
        <div class="win-page-content">
            <h2>Congratulations!</h2>
            <p>You found all ${maxCoupons} treasures in Navi Quest!</p>
            
            <div class="completion-stats">
                <div class="stat-item">
                    <span class="stat-number">Flat 20% OFF</span>
                    <span class="stat-label">on the next bill payment upto Rs 300</span>
                </div>
            </div>
            

            
            <div class="win-page-actions">
                <button class="win-btn primary" onclick="restartGame()">Play Again</button>
                <button class="win-btn secondary" onclick="exitToStart()">Exit</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add CSS styles for win page
    if (!document.getElementById('win-page-styles')) {
        const styles = document.createElement('style');
        styles.id = 'win-page-styles';
        styles.textContent = `
            .win-page-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, 
                    rgba(30, 30, 40, 0.95),
                    rgba(20, 25, 35, 0.95),
                    rgba(15, 20, 30, 0.95)
                );
                backdrop-filter: blur(40px) saturate(150%);
                -webkit-backdrop-filter: blur(40px) saturate(150%);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                font-family: 'Titillium Web', sans-serif;
                overflow: hidden; /* Prevent any scrolling */
            }
            
            .win-page-content {
                background: linear-gradient(135deg, 
                    rgba(255, 255, 255, 0.15),
                    rgba(255, 255, 255, 0.05)
                );
                backdrop-filter: blur(30px) saturate(120%);
                -webkit-backdrop-filter: blur(30px) saturate(120%);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 25px;
                padding: 40px 30px;
                max-width: 90vw;
                max-height: 90vh;
                overflow-y: auto;
                overflow-x: hidden; /* Prevent horizontal scrolling */
                text-align: center;
                box-shadow: 
                    0 20px 60px rgba(0, 0, 0, 0.3),
                    0 4px 16px rgba(255, 255, 255, 0.1) inset,
                    0 -4px 16px rgba(0, 0, 0, 0.1) inset;
                position: relative;
            }
            
            .win-page-content::before {
                content: '';
                position: absolute;
                top: 0;
                left: -50%;
                width: 50%;
                height: 100%;
                background: linear-gradient(90deg, 
                    transparent, 
                    rgba(255, 255, 255, 0.15), 
                    transparent
                );
                animation: winPageShimmer 3s infinite;
                pointer-events: none;
            }
            
            @keyframes winPageShimmer {
                0% { left: -50%; }
                100% { left: 100%; }
            }
            
            .win-page-content h2 {
                color: rgba(255, 255, 255, 0.95);
                margin-bottom: 15px;
                font-size: 2.2em;
                font-weight: 700;
                text-shadow: 
                    0 4px 20px rgba(100, 120, 140, 0.3),
                    0 0 30px rgba(255, 255, 255, 0.1);
                background: linear-gradient(135deg, 
                    rgba(255, 255, 255, 1),
                    rgba(200, 210, 220, 0.9)
                );
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .win-page-content p {
                color: rgba(255, 255, 255, 0.85);
                font-size: 1.1em;
                margin-bottom: 25px;
                text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            }
            
            .completion-stats {
                display: flex;
                justify-content: center;
                margin: 25px 0;
                gap: 15px;
                flex-wrap: wrap;
            }
            
            .stat-item {
                text-align: center;
                padding: 18px 15px;
                background: linear-gradient(135deg, 
                    rgba(255, 255, 255, 0.2),
                    rgba(255, 255, 255, 0.05)
                );
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 18px;
                color: rgba(255, 255, 255, 0.95);
                flex: 1;
                min-width: 120px;
                box-shadow: 
                    0 8px 24px rgba(0, 0, 0, 0.1),
                    0 2px 6px rgba(255, 255, 255, 0.15) inset;
                position: relative;
                overflow: hidden;
            }
            
            .stat-item::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 50%;
                background: linear-gradient(180deg, 
                    rgba(255, 255, 255, 0.1), 
                    transparent
                );
                border-radius: 18px 18px 0 0;
            }
            
            .stat-number {
                display: block;
                font-size: 2.2em;
                font-weight: 700;
                text-shadow: 
                    0 2px 8px rgba(0, 0, 0, 0.3),
                    0 0 15px rgba(255, 255, 255, 0.2);
                margin-bottom: 5px;
            }
            
            .stat-label {
                font-size: 0.85em;
                opacity: 0.85;
                font-weight: 500;
                text-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
                letter-spacing: 0.3px;
            }
            

            
            .win-page-actions {
                display: flex;
                gap: 20px;
                justify-content: center;
                margin-top: 25px;
                flex-wrap: wrap;
            }
            
            .win-btn {
                font-family: 'Titillium Web', sans-serif;
                padding: 15px 30px;
                border: 1px solid rgba(255, 255, 255, 0.25);
                border-radius: 30px;
                font-size: 1em;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                position: relative;
                overflow: hidden;
                min-width: 140px;
                text-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            }
            
            .win-btn::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, 
                    transparent, 
                    rgba(255, 255, 255, 0.2), 
                    transparent
                );
                transition: left 0.5s ease;
            }
            
            .win-btn:hover::before {
                left: 100%;
            }
            
            .win-btn:hover {
                transform: translateY(-2px) scale(1.05);
                box-shadow: 
                    0 12px 30px rgba(0, 0, 0, 0.15),
                    0 4px 12px rgba(255, 255, 255, 0.2) inset;
            }
            
            .win-btn:active {
                transform: translateY(0) scale(0.98);
            }
            
            .win-btn.primary {
                background: linear-gradient(135deg, 
                    rgba(138, 43, 226, 0.8),
                    rgba(75, 0, 130, 0.6)
                );
                color: rgba(255, 255, 255, 0.95);
                border-top: 1px solid rgba(255, 255, 255, 0.4);
                box-shadow: 
                    0 8px 25px rgba(0, 0, 0, 0.1),
                    0 2px 6px rgba(255, 255, 255, 0.15) inset,
                    0 0 20px rgba(138, 43, 226, 0.3);
            }
            
            .win-btn.secondary {
                background: linear-gradient(135deg, 
                    rgba(255, 255, 255, 0.15),
                    rgba(255, 255, 255, 0.05)
                );
                color: rgba(255, 255, 255, 0.9);
                box-shadow: 
                    0 8px 25px rgba(0, 0, 0, 0.08),
                    0 2px 6px rgba(255, 255, 255, 0.1) inset;
            }
            
            @media (max-width: 480px) {
                .win-page-content {
                    padding: 25px 20px;
                    margin: 10px;
                }
                
                .completion-stats {
                    flex-direction: column;
                    gap: 10px;
                }
                
                .stat-item {
                    min-width: auto;
                }
                
                .win-page-actions {
                    flex-direction: column;
                    gap: 12px;
                }
                
                .win-btn {
                    min-width: auto;
                    width: 100%;
                }
            }
        `;
        document.head.appendChild(styles);
    }
}

// Show failure page when time runs out
function showFailureScreen() {
    console.log('showFailureScreen called');
    
    // Hide AR view and show start screen structure with null checks
    const arView = document.getElementById('ar-view');
    const arContainerView = document.getElementById('ar-container-view');
    const startScreen = document.getElementById('start-screen');
    
    console.log('AR elements found:', { arView: !!arView, arContainerView: !!arContainerView, startScreen: !!startScreen });
    
    // Force hide all other screens
    if (arView) {
        arView.style.display = 'none';
        console.log('AR view hidden');
    }
    if (arContainerView) {
        arContainerView.style.display = 'none';
        console.log('AR container hidden');
    }
    if (startScreen) {
        startScreen.style.display = 'none';
        console.log('Start screen hidden');
    }
    
    // Remove any existing overlays
    const existingOverlays = document.querySelectorAll('.win-page-overlay');
    existingOverlays.forEach(overlay => {
        overlay.remove();
        console.log('Removed existing overlay');
    });
    
    const collectedCount = getCouponsCollected();
    console.log('Collected count for failure screen:', collectedCount);
    
    // Create failure page overlay (same structure as win page)
    const overlay = document.createElement('div');
    overlay.className = 'win-page-overlay';
    overlay.style.zIndex = '99999'; // Ensure it's on top
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    const remainingTreasures = maxCoupons - collectedCount;
    overlay.innerHTML = `
        <div class="win-page-content">
            <h2>Oops!! Time's Up</h2>
            <p>You were just short by ${remainingTreasures} treasure${remainingTreasures === 1 ? '' : 's'}.</p>
            
            <div class="completion-stats">
                <div class="stat-item">
                    <span class="stat-number">Get 30s extra</span>
                    <span class="stat-label">if you do UPI payment in next 10 min</span>
                </div>
            </div>
            
            <div class="win-page-actions">
                <button class="win-btn secondary" onclick="exitToStart()">Exit</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    console.log('Failure screen overlay added to DOM');
    
    // Force the overlay to be visible
    overlay.style.display = 'flex';
    overlay.style.visibility = 'visible';
    
    // Ensure CSS styles are available (same as win page)
    if (!document.getElementById('win-page-styles')) {
        console.log('Loading CSS styles for failure screen');
        const styles = document.createElement('style');
        styles.id = 'win-page-styles';
        styles.textContent = `
            .win-page-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, 
                    rgba(30, 30, 40, 0.95),
                    rgba(20, 25, 35, 0.95),
                    rgba(15, 20, 30, 0.95)
                );
                backdrop-filter: blur(40px) saturate(150%);
                -webkit-backdrop-filter: blur(40px) saturate(150%);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                font-family: 'Titillium Web', sans-serif;
                overflow: hidden;
            }
            
            .win-page-content {
                background: linear-gradient(135deg, 
                    rgba(255, 255, 255, 0.15),
                    rgba(255, 255, 255, 0.05)
                );
                backdrop-filter: blur(30px) saturate(120%);
                -webkit-backdrop-filter: blur(30px) saturate(120%);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 25px;
                padding: 40px 30px;
                max-width: 90vw;
                max-height: 90vh;
                overflow-y: auto;
                overflow-x: hidden;
                text-align: center;
                box-shadow: 
                    0 20px 60px rgba(0, 0, 0, 0.3),
                    0 4px 16px rgba(255, 255, 255, 0.1) inset,
                    0 -4px 16px rgba(0, 0, 0, 0.1) inset;
                position: relative;
            }
            
            .win-page-content::before {
                content: '';
                position: absolute;
                top: 0;
                left: -50%;
                width: 50%;
                height: 100%;
                background: linear-gradient(90deg, 
                    transparent, 
                    rgba(255, 255, 255, 0.15), 
                    transparent
                );
                animation: winPageShimmer 3s infinite;
                pointer-events: none;
            }
            
            @keyframes winPageShimmer {
                0% { left: -50%; }
                100% { left: 100%; }
            }
            
            .win-page-content h2 {
                color: rgba(255, 255, 255, 0.95);
                margin-bottom: 15px;
                font-size: 2.2em;
                font-weight: 700;
                text-shadow: 
                    0 4px 20px rgba(100, 120, 140, 0.3),
                    0 0 30px rgba(255, 255, 255, 0.1);
                background: linear-gradient(135deg, 
                    rgba(255, 255, 255, 1),
                    rgba(200, 210, 220, 0.9)
                );
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .win-page-content p {
                color: rgba(255, 255, 255, 0.85);
                font-size: 1.1em;
                margin-bottom: 25px;
                text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            }
            
            .completion-stats {
                display: flex;
                justify-content: center;
                margin: 25px 0;
                gap: 15px;
                flex-wrap: wrap;
            }
            
            .stat-item {
                text-align: center;
                padding: 18px 15px;
                background: linear-gradient(135deg, 
                    rgba(255, 255, 255, 0.2),
                    rgba(255, 255, 255, 0.05)
                );
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 18px;
                color: rgba(255, 255, 255, 0.95);
                flex: 1;
                min-width: 120px;
                box-shadow: 
                    0 8px 24px rgba(0, 0, 0, 0.1),
                    0 2px 6px rgba(255, 255, 255, 0.15) inset;
                position: relative;
                overflow: hidden;
            }
            
            .stat-item::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 50%;
                background: linear-gradient(180deg, 
                    rgba(255, 255, 255, 0.1), 
                    transparent
                );
                border-radius: 18px 18px 0 0;
            }
            
            .stat-number {
                display: block;
                font-size: 2.2em;
                font-weight: 700;
                text-shadow: 
                    0 2px 8px rgba(0, 0, 0, 0.3),
                    0 0 15px rgba(255, 255, 255, 0.2);
                margin-bottom: 5px;
            }
            
            .stat-label {
                font-size: 0.85em;
                opacity: 0.85;
                font-weight: 500;
                text-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
                letter-spacing: 0.3px;
            }
            
            .win-page-actions {
                display: flex;
                gap: 20px;
                justify-content: center;
                margin-top: 25px;
                flex-wrap: wrap;
            }
            
            .win-btn {
                font-family: 'Titillium Web', sans-serif;
                padding: 15px 30px;
                border: 1px solid rgba(255, 255, 255, 0.25);
                border-radius: 30px;
                font-size: 1em;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                position: relative;
                overflow: hidden;
                min-width: 140px;
                text-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            }
            
            .win-btn::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, 
                    transparent, 
                    rgba(255, 255, 255, 0.2), 
                    transparent
                );
                transition: left 0.5s ease;
            }
            
            .win-btn:hover::before {
                left: 100%;
            }
            
            .win-btn:hover {
                transform: translateY(-2px) scale(1.05);
                box-shadow: 
                    0 12px 30px rgba(0, 0, 0, 0.15),
                    0 4px 12px rgba(255, 255, 255, 0.2) inset;
            }
            
            .win-btn:active {
                transform: translateY(0) scale(0.98);
            }
            
            .win-btn.primary {
                background: linear-gradient(135deg, 
                    rgba(138, 43, 226, 0.8),
                    rgba(75, 0, 130, 0.6)
                );
                color: rgba(255, 255, 255, 0.95);
                border-top: 1px solid rgba(255, 255, 255, 0.4);
                box-shadow: 
                    0 8px 25px rgba(0, 0, 0, 0.1),
                    0 2px 6px rgba(255, 255, 255, 0.15) inset,
                    0 0 20px rgba(138, 43, 226, 0.3);
            }
            
            .win-btn.secondary {
                background: linear-gradient(135deg, 
                    rgba(255, 255, 255, 0.15),
                    rgba(255, 255, 255, 0.05)
                );
                color: rgba(255, 255, 255, 0.9);
                box-shadow: 
                    0 8px 25px rgba(0, 0, 0, 0.08),
                    0 2px 6px rgba(255, 255, 255, 0.1) inset;
            }
            
            @media (max-width: 480px) {
                .win-page-content {
                    padding: 25px 20px;
                    margin: 10px;
                }
                
                .completion-stats {
                    flex-direction: column;
                    gap: 10px;
                }
                
                .stat-item {
                    min-width: auto;
                }
                
                .win-page-actions {
                    flex-direction: column;
                    gap: 12px;
                }
                
                .win-btn {
                    min-width: auto;
                    width: 100%;
                }
            }
        `;
        document.head.appendChild(styles);
        console.log('CSS styles loaded for failure screen');
    }
    
    // Reset challenge failed flag now that failure screen is shown
    challengeFailed = false;
    
    console.log('Failure screen should now be visible with z-index:', overlay.style.zIndex);
}

// Test function to manually show failure screen (call from console)
function testFailureScreen() {
    console.log('Testing failure screen manually');
    challengeFailed = true;
    showFailureScreen();
}

// Make test function globally available
window.testFailureScreen = testFailureScreen;

// Initialize timer display on page load
function initializeTimerDisplay() {
    const countdownNumber = document.getElementById('countdown-number');
    if (countdownNumber) {
        countdownNumber.textContent = CHALLENGE_DURATION_SECONDS.toString();
        console.log(`Timer display initialized to ${CHALLENGE_DURATION_SECONDS} seconds`);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeTimerDisplay);

// Also initialize immediately in case DOM is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTimerDisplay);
} else {
    initializeTimerDisplay();
}



function onXRFrame(time, frame) {
    // Bind the graphics framebuffer to the baseLayer's framebuffer
    const session = frame.session;
    const gl = renderer.getContext();
    gl.bindFramebuffer(gl.FRAMEBUFFER, session.renderState.baseLayer.framebuffer);
    session.requestAnimationFrame(onXRFrame);
    
    const pose = frame.getViewerPose(xrReferenceSpace);
    if (pose) {
        // In mobile AR, we only have one view.
        const view = pose.views[0];
        
        const viewport = session.renderState.baseLayer.getViewport(view);
        renderer.setSize(viewport.width, viewport.height);
        renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
        
        // CRITICAL: Update camera matrices from WebXR frame (Google WebXR pattern)
        camera.matrix.fromArray(view.transform.matrix);
        camera.projectionMatrix.fromArray(view.projectionMatrix);
        camera.updateMatrixWorld(true);
        
        // Handle hit testing following Google WebXR patterns
        if (xrHitTestSource) {
            const hitTestResults = frame.getHitTestResults(xrHitTestSource);
            
            if (hitTestResults.length > 0) {
                const hitPose = hitTestResults[0].getPose(xrReferenceSpace);
                
                // No reticle needed - just use hit test for coupon spawning
                
                // Initialize fixed coupons once
                initializeCoupons(hitTestResults);
            } else {
                // No hit test results - update status
                if (!couponsInitialized) {
                    updateCollectionStatus('Point camera at floor to find treasures.');
                }
            }
        }
        

        
        // Animate all coupons
        animateCoupons(time);
        
        // Animate original coupon if it exists
        if (coupon && coupon.visible) {
            coupon.rotation.y += 0.01;
            coupon.position.y = 0.1 + Math.sin(time * 0.003) * 0.02;
        }
        
        // Animate coupons for visual appeal
        if (couponsInitialized && coupons.length > 0) {
            // Coupons are now collected via click/tap events
        }
        

    }
    
    // CRITICAL: Render the scene (moved outside pose check as per Google pattern)
    renderer.render(scene, camera);
    

}

function shouldPlaceCoupon() {
    // Auto-place coupon after a short delay for better UX
    if (!window.couponPlaceTimer) {
        window.couponPlaceTimer = setTimeout(() => {
            window.shouldPlace = true;
        }, 2000); // Place after 2 seconds of surface detection
    }
    return window.shouldPlace;
}

function placeCoupon(hitPose) {
    if (!coupon || couponPlaced) return;
    
    console.log('Placing coupon...');
    
    // Position coupon above the surface
    coupon.position.set(
        hitPose.transform.position.x,
        hitPose.transform.position.y + 0.1, // Float above surface
        hitPose.transform.position.z
    );
    
    coupon.visible = true;
    couponPlaced = true;
    
    // Hide reticle
    if (reticle) {
        reticle.visible = false;
    }
    
    // Update UI
    updateCollectionStatus('Coupon placed! Focus on it to collect.');
    
    console.log('Coupon placed at:', coupon.position);
}

function updateCouponAnimation(time) {
    if (!coupon) return;
    
    // Floating animation
    const floatY = Math.sin(time * 0.002) * 0.02;
    coupon.position.y += floatY;
    
    // Rotation animation
    coupon.rotation.y += 0.01;
}

function checkCouponFocus(frame) {
    if (!coupon || !coupon.visible || couponCollected) return;
    
    const pose = frame.getViewerPose(xrReferenceSpace);
    if (!pose) return;
    
    // Calculate if coupon is in center of view
    const viewerPos = new THREE.Vector3().fromArray(pose.views[0].transform.position);
    const couponPos = coupon.position;
    
    // Get camera forward direction
    const cameraMatrix = new THREE.Matrix4().fromArray(pose.views[0].transform.matrix);
    const cameraForward = new THREE.Vector3(0, 0, -1).applyMatrix4(cameraMatrix).normalize();
    
    // Calculate direction to coupon
    const toCoupon = new THREE.Vector3().subVectors(couponPos, viewerPos).normalize();
    
    // Check alignment (dot product close to 1 means aligned)
    const alignment = cameraForward.dot(toCoupon);
    const focusThreshold = 0.8; // 80% alignment required
    
    if (alignment > focusThreshold) {
        if (!focusStartTime) {
            focusStartTime = Date.now();
            showFocusIndicator(true);
        } else {
            const focusTime = Date.now() - focusStartTime;
            const progress = Math.min(focusTime / requiredFocusTime, 1);
            updateFocusProgress(progress);
            
            if (focusTime >= requiredFocusTime) {
                collectCoupon();
            }
        }
    } else {
        // Lost focus
        focusStartTime = null;
        showFocusIndicator(false);
        updateFocusProgress(0);
    }
}

function collectCoupon() {
    if (couponCollected) return;
    
    console.log('Collecting coupon...');
    couponCollected = true;
    
    // Animate collection
    if (coupon) {
        const collectAnimation = () => {
            coupon.scale.multiplyScalar(1.1);
            coupon.material.opacity *= 0.9;
            
            if (coupon.material.opacity > 0.1) {
                requestAnimationFrame(collectAnimation);
            } else {
                coupon.visible = false;
                showSuccess();
            }
        };
        collectAnimation();
    }
    
    // Play success sound
    playSuccessSound();
    
    // Update UI
    updateStatus('Collected!');
    showFocusIndicator(false);
}

// UI Helper Functions
function startGame() {
    gameActive = true;
    updateCollectionStatus('Scanning for surfaces...');
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function updateInstructions(message) {
    const instructions = document.getElementById('instructions');
    if (instructions) {
        instructions.innerHTML = `
            <p>${message}</p>
            <div id="focus-indicator" class="focus-indicator">
                <div class="focus-circle"></div>
                <div class="focus-progress-container">
                    <div id="focus-progress" class="focus-progress"></div>
                    <span id="focus-text" class="focus-text">0%</span>
                </div>
            </div>
            <div class="arcore-status">
                <span class="arcore-badge">WebXR ARCore</span>
            </div>
        `;
    }
}

function updateStatus(status) {
    const statusElement = document.getElementById('collection-status');
    if (statusElement) {
        statusElement.textContent = status;
    }
}







// Update collection counter display
function updateCollectionCounter() {
    const collectedCount = getCouponsCollected();
    
    console.log('updateCollectionCounter called. Collected:', collectedCount, 'Total:', maxCoupons);
    
    // Try multiple ways to find and update the counter elements
    const collectedElements = [
        document.getElementById('collected-count'),
        document.querySelector('.collection-count'),
        document.querySelector('[id="collected-count"]')
    ].filter(el => el !== null);
    
    const totalElements = [
        document.getElementById('total-count'),
        document.querySelector('.collection-total'),
        document.querySelector('[id="total-count"]')
    ].filter(el => el !== null);
    
    console.log('Found collected elements:', collectedElements.length);
    console.log('Found total elements:', totalElements.length);
    
    // Update all found collected count elements
    collectedElements.forEach((element, index) => {
        element.textContent = collectedCount.toString();
        console.log(`Updated collected element ${index} to:`, collectedCount);
    });
    
    // Update all found total count elements
    totalElements.forEach((element, index) => {
        element.textContent = maxCoupons.toString();
        console.log(`Updated total element ${index} to:`, maxCoupons);
    });
    
    // If no elements found, log the DOM structure
    if (collectedElements.length === 0) {
        console.error('No collected-count elements found!');
        console.log('Available elements with collection classes:', document.querySelectorAll('[class*="collection"]'));
    }
    
    // Update overall progress bar
    updateOverallProgress();
    
    // Force a visual update by triggering a reflow
    if (collectedElements.length > 0) {
        collectedElements[0].style.display = 'none';
        collectedElements[0].offsetHeight; // Trigger reflow
        collectedElements[0].style.display = '';
    }
}

// Update overall progress bar
function updateOverallProgress() {
    const progressElement = document.getElementById('overall-progress');
    if (progressElement) {
        const collected = getCouponsCollected();
        const total = maxCoupons;
        const percentage = (collected / total) * 100;
        progressElement.style.width = `${percentage}%`;
    }
}

// Update collection status display
function updateCollectionStatus(message) {
    const statusElement = document.getElementById('collection-status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

// Test function to manually update counter (call from console)
function testCounterUpdate(count = 2) {
    console.log('Testing counter update with count:', count);
    
    // Temporarily override getCouponsCollected for testing
    const originalGetCouponsCollected = getCouponsCollected;
    window.getCouponsCollected = () => count;
    
    // Update counter
    updateCollectionCounter();
    
    // Restore original function after a delay
    setTimeout(() => {
        window.getCouponsCollected = originalGetCouponsCollected;
    }, 5000);
    
    console.log('Counter test complete. Check if display updated.');
}

// Make test function globally available
window.testCounterUpdate = testCounterUpdate;

// Handle browser back button and page visibility changes
window.addEventListener('popstate', function(event) {
    console.log('Browser back button pressed');
    if (xrSession) {
        xrSession.end();
    }
    returnToStartScreen();
});

// Handle page visibility changes (when user switches tabs or minimizes)
window.addEventListener('visibilitychange', function() {
    if (document.hidden && xrSession) {
        console.log('Page hidden, ending XR session');
        xrSession.end();
    }
});

// Handle page unload
window.addEventListener('beforeunload', function() {
    if (xrSession) {
        xrSession.end();
    }
});

// Background Sound System
let backgroundAudio = null;
let audioContext = null;
let isSoundEnabled = true; // Controls background music only
let soundEffectsEnabled = true; // Sound effects are ALWAYS enabled (never disabled)
let backgroundMusicPlaying = false;

// Initialize audio system
function initializeAudio() {
    try {
        // Create HTML5 Audio element for background music
        backgroundAudio = new Audio('assets/background-sound.mp3');
        backgroundAudio.loop = true;
        backgroundAudio.volume = 0.3; // Set to 30% volume
        backgroundAudio.preload = 'auto';
        
        // Add event listeners for audio loading
        backgroundAudio.addEventListener('canplaythrough', function() {
            console.log('Background music loaded and ready for AR mode');
        });
        
        backgroundAudio.addEventListener('error', function(e) {
            console.log('Background music loading error:', e);
        });
        
        // Initialize Web Audio Context for sound effects
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('Audio system initialized - music will play only in AR mode');
        
    } catch (error) {
        console.log('Audio not available:', error.message);
    }
}



// Create ambient background music for AR mode
function createBackgroundMusic() {
    if (!backgroundAudio || !isSoundEnabled) return;
    
    try {
        // Resume audio context if suspended (required by browsers)
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        // Play the MP3 background music
        const playPromise = backgroundAudio.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                backgroundMusicPlaying = true;
                console.log('AR background music started');
            }).catch(error => {
                console.log('AR background music play failed:', error.message);
                // Note: No fallback needed since this is called during AR session
                // where user interaction has already occurred
            });
        }
        
    } catch (error) {
        console.log('AR background music creation failed:', error.message);
    }
}

// Stop background music
function stopBackgroundMusic() {
    if (backgroundAudio && backgroundMusicPlaying) {
        try {
            backgroundAudio.pause();
            backgroundAudio.currentTime = 0; // Reset to beginning
            backgroundMusicPlaying = false;
            console.log('Background music stopped');
        } catch (error) {
            console.log('Error stopping background music:', error.message);
        }
    }
}

// Setup AR sound toggle
function setupARSoundToggle() {
    const arSoundToggle = document.getElementById('ar-sound-toggle');
    if (arSoundToggle) {
        // Set initial button state
        arSoundToggle.textContent = isSoundEnabled ? '🔊' : '🔇';
        arSoundToggle.title = isSoundEnabled ? 'Mute Sound' : 'Enable Sound';
        
        arSoundToggle.addEventListener('click', function() {
            toggleSound();
        });
    }
}

// Toggle sound on/off
function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
    
    if (isSoundEnabled) {
        // Only start music if we're currently in AR mode
        if (xrSession && !backgroundMusicPlaying) {
            createBackgroundMusic();
        }
        console.log('Sound enabled - will play during AR mode');
    } else {
        stopBackgroundMusic();
        console.log('Sound disabled');
    }
    
    // Update AR sound toggle button
    const arSoundButton = document.getElementById('ar-sound-toggle');
    if (arSoundButton) {
        arSoundButton.textContent = isSoundEnabled ? '🔊' : '🔇';
        arSoundButton.title = isSoundEnabled ? 'Mute Sound' : 'Enable Sound';
    }
    
    // Save sound preference to localStorage
    localStorage.setItem('soundEnabled', isSoundEnabled.toString());
}

// Start background music when AR mode starts
function startGameAudio() {
    if (!backgroundAudio) {
        initializeAudio();
    }
    
    if (isSoundEnabled && !backgroundMusicPlaying) {
        console.log('Starting background music for AR mode');
        createBackgroundMusic();
    }
}

// Collection sound - always enabled regardless of background music setting
function playCollectionSound() {
    try {
        // Create audioContext if it doesn't exist
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Resume audioContext if it's suspended
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        // Sound failed silently
    }
}

// Cleanup audio on page unload
window.addEventListener('beforeunload', function() {
    stopBackgroundMusic();
    if (audioContext) {
        audioContext.close();
    }
    if (backgroundAudio) {
        backgroundAudio.pause();
        backgroundAudio = null;
    }
});

function showLoading(message) {
    const overlay = document.createElement('div');
    overlay.className = 'arcore-loading-overlay';
    overlay.innerHTML = `
        <div class="arcore-loading">
            <div class="arcore-spinner"></div>
            <div class="arcore-loading-text">${message}</div>
            <p>Please wait while WebXR initializes...</p>
        </div>
    `;
    document.body.appendChild(overlay);
}

function hideLoading() {
    const overlays = document.querySelectorAll('.arcore-loading-overlay, .loading-overlay');
    overlays.forEach(overlay => {
        if (overlay && overlay.parentNode) {
            overlay.remove();
        }
    });
}

function showError(message) {
    const overlay = document.createElement('div');
    overlay.className = 'error-overlay';
    
    // Removed HTTPS guidance section
    
    overlay.innerHTML = `
        <div class="error-content">
            <h2>WebXR Error</h2>
            <p>${message}</p>

            <div class="webxr-debug-info">
                <h3>Debug Information:</h3>
                <p>🌐 Browser: ${navigator.userAgent.includes('Chrome') ? '✅ Chrome' : '❌ ' + navigator.userAgent.split(' ').pop()}</p>
                <p>🔒 Protocol: ${window.location.protocol}</p>
                <p>🥽 WebXR API: ${navigator.xr ? '✅ Available' : '❌ Not Available'}</p>
                <p>📱 User Agent: ${navigator.userAgent.includes('Mobile') ? '✅ Mobile' : '❌ Desktop'}</p>
                <p>🔗 Current URL: ${window.location.protocol}//${window.location.host}</p>
            </div>
            <div class="error-actions">
                <button onclick="checkWebXRSupport()" class="retry-btn">Check Support</button>
                <button onclick="location.reload()" class="retry-btn secondary">Try Again</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function checkWebXRSupport() {
    const results = {
        webxr: !!navigator.xr,
        immersiveAR: false,
        hitTest: false
    };
    
    if (navigator.xr) {
        try {
            results.immersiveAR = await navigator.xr.isSessionSupported('immersive-ar');
        } catch (e) {
            // Silent error handling
        }
    }
    
    alert(`WebXR Support:\nWebXR API: ${results.webxr ? 'Yes' : 'No'}\nImmersive AR: ${results.immersiveAR ? 'Yes' : 'No'}`);
}

function showSuccess() {
    setTimeout(() => {
        showScreen('complete-screen');
        document.getElementById('final-discount').textContent = '25%';
    }, 1000);
}

function playSuccessSound() {
    // Simple success sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

// Load sound preference from localStorage
function loadSoundPreference() {
    const savedPreference = localStorage.getItem('soundEnabled');
    if (savedPreference !== null) {
        isSoundEnabled = savedPreference === 'true';
        console.log('Loaded sound preference:', isSoundEnabled);
    }
}

// Initialize when DOM is ready - but don't auto-start WebXR
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadSoundPreference();
        setupStartButton();
    });
} else {
    loadSoundPreference();
    setupStartButton();
}

function setupStartButton() {
    // Show the loading screen initially, but with a start button
    showScreen('loading-screen');
    
    // Initialize audio system (but don't start music yet)
    initializeAudio();
    
    // Add click handler to start button
    const startButton = document.getElementById('start-ar-btn');
    if (startButton) {
        startButton.addEventListener('click', function() {
            // Music will start when AR mode begins
            activateXR();
        });
    }
}

// Navigation handling functions
function setupNavigationHandling() {
    // Handle browser back button
    window.addEventListener('popstate', handleBackNavigation);
    
    // Handle page visibility changes (when user switches apps)
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Handle beforeunload (when user tries to leave page)
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Push a state to handle back navigation
    if (!navigationHandled) {
        history.pushState({ page: 'ar-session' }, 'AR Session', window.location.href);
        navigationHandled = true;
    }
    
    console.log('Navigation handling setup complete');
}

function handleBackNavigation(event) {
    console.log('Back navigation detected');
    
    if (xrSession) {
        // End XR session and return to start
        endXRSession();
    }
    
    // Ensure we go back to start screen
    returnToStartScreen();
}

function handleVisibilityChange() {
    if (document.hidden && xrSession) {
        console.log('Page hidden, ending XR session');
        endXRSession();
    }
}

function handleBeforeUnload(event) {
    if (xrSession) {
        endXRSession();
    }
}

function endXRSession() {
    if (xrSession) {
        console.log('Ending XR session...');
        try {
            xrSession.end();
        } catch (error) {
            console.warn('Error ending XR session:', error);
        }
        xrSession = null;
    }
    
    // Clean up game state
    resetGameState();
}

function onSessionEnd() {
    xrSession = null;
    
    // Stop background music when session ends
    stopBackgroundMusic();
    
    // Preserve timing data if game was completed successfully
    const wasGameCompleted = (getCouponsCollected() === maxCoupons);
    const preservedStartTime = gameStartTime;
    const preservedEndTime = gameEndTime;
    
    // Clean up game state but don't reset challenge failure flag yet
    const wasChallengeFailure = challengeFailed;
    resetGameState();
    
    // Restore timing data if game was completed successfully
    if (wasGameCompleted && preservedStartTime && preservedEndTime) {
        gameStartTime = preservedStartTime;
        gameEndTime = preservedEndTime;
    }
    
    // Only return to start screen if it wasn't a challenge failure
    if (!wasChallengeFailure) {
        // Show start screen for normal session end
        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
            startScreen.style.display = 'flex';
            console.log('Normal session end - showing start screen');
        }
    } else {
        console.log('Challenge failure detected - letting failure screen show');
        // Don't show start screen, let the failure screen show instead
    }
}

function resetGameState() {
    // Reset all game variables
    couponPlaced = false;
    couponCollected = false;
    focusStartTime = null;
    gameActive = false;
    couponsInitialized = false;
    
    // Reset timer
    gameStartTime = null;
    gameEndTime = null;
    
    // Reset challenge timer
    stopChallengeTimer();
    // Note: challengeFailed is reset separately to allow onSessionEnd to check it
    challengeStartTime = null;
    
    // Clear all coupons
    coupons.forEach(couponObj => {
        if (scene && couponObj) {
            scene.remove(couponObj);
        }
    });
    coupons = [];
    
    // Hide game elements
    if (coupon) coupon.visible = false;
    
    // Reset UI counters
    updateCollectionCounter();
    
    // Hide AR overlay (but don't automatically show start screen)
    const arContainerView = document.getElementById('ar-container-view');
    
    if (arContainerView) {
        arContainerView.style.display = 'none';
        console.log('AR overlay hidden');
    }
    
    // Note: Screen management is now handled by calling functions
}

function returnToStartScreen() {
    console.log('Returning to start screen');
    
    // Stop background music when returning to start
    stopBackgroundMusic();
    
    // Hide any overlays
    const overlays = document.querySelectorAll('.error-overlay, .arcore-loading-overlay, .win-page-overlay');
    overlays.forEach(overlay => overlay.remove());
    
    // Show start screen and hide AR container with null checks
    const startScreen = document.getElementById('start-screen');
    const arContainerView = document.getElementById('ar-container-view');
    const arView = document.getElementById('ar-view');
    
    if (startScreen) {
        startScreen.style.display = 'flex';
        console.log('Start screen displayed');
    } else {
        console.error('Start screen element not found');
    }
    
    if (arContainerView) {
        arContainerView.style.display = 'none';
        console.log('AR container view hidden');
    }
    
    if (arView) {
        arView.style.display = 'none';
        console.log('AR view hidden');
    }
    
    // Reset game state to ensure clean return
    gameActive = false;
    couponsInitialized = false;
}

// Restart game function for win page
function restartGame() {
    // Remove win page overlay
    const winOverlay = document.querySelector('.win-page-overlay');
    if (winOverlay) {
        winOverlay.remove();
    }
    
    // Reset game state
    resetGameState();
    
    // Restart AR experience
    activateXR();
}

// Exit to start page function for win page
function exitToStart() {
    // Remove win page overlay
    const winOverlay = document.querySelector('.win-page-overlay');
    if (winOverlay) {
        winOverlay.remove();
    }
    
    // Reset game state
    resetGameState();
    
    // Return to start screen
    returnToStartScreen();
}

function placeCoupon() {
    // This function is no longer needed for the new coupon system
    // Coupons are placed automatically when surfaces are detected
    updateCollectionStatus('Coupons ready for collection!');
}
