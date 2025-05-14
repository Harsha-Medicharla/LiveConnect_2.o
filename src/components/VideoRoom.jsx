import React, { useState, useEffect } from 'react';
import { styled } from '@mui/material/styles';
import Button from '@mui/material/Button';
import VideocamIcon from '@mui/icons-material/Videocam';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import GroupIcon from '@mui/icons-material/Group';
import CloseIcon from '@mui/icons-material/Close';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

import websocketService, { servers } from '../services/websocketService';
import JoinRoomDialog from './JoinRoomDialog';
import VideoStream from './VideoStream';

// Using styled API instead of makeStyles
const Root = styled('div')(({ theme }) => ({
  flexGrow: 1,
  padding: theme.spacing(2),
}));

const StyledButton = styled(Button)(({ theme }) => ({
  margin: theme.spacing(1),
}));

const VideosContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  marginTop: theme.spacing(2),
}));

const VideoWrapper = styled(Paper)(({ theme }) => ({
  flex: 1,
  padding: theme.spacing(1),
}));

const CurrentRoom = styled('div')(({ theme }) => ({
  marginTop: theme.spacing(2),
  marginBottom: theme.spacing(2),
}));

function VideoRoom() {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('info');

  // Enable/disable buttons based on state
  const cameraEnabled = localStream !== null;
  const roomConnected = roomId !== null;

  // Initialize WebSocket connection
  useEffect(() => {
    const initWebSocket = async () => {
      try {
        await websocketService.connect();
      } catch (error) {
        console.error('Failed to connect to WebSocket server:', error);
        showSnackbar('Failed to connect to signaling server', 'error');
      }
    };

    initWebSocket();

    return () => {
      websocketService.disconnect();
    };
  }, []);

  // Helper function to show snackbar notifications
  const showSnackbar = (message, severity = 'info') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  // Clean up function to handle hangup
  const cleanUp = async () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }

    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
    }

    // Clean up room resources
    if (roomId) {
      await websocketService.leaveRoom(roomId);
      setRoomId(null);
    }
  };

  // Set up listeners for peer connection
  const registerPeerConnectionListeners = (pc) => {
    pc.addEventListener('icegatheringstatechange', () => {
      console.log(`ICE gathering state changed: ${pc.iceGatheringState}`);
    });

    pc.addEventListener('connectionstatechange', () => {
      console.log(`Connection state change: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        showSnackbar('Peer connection established!', 'success');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        showSnackbar('Peer connection lost', 'warning');
      }
    });

    pc.addEventListener('signalingstatechange', () => {
      console.log(`Signaling state change: ${pc.signalingState}`);
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      console.log(`ICE connection state change: ${pc.iceConnectionState}`);
    });
  };

  // Open camera and microphone
  const openUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      setLocalStream(stream);
      setRemoteStream(new MediaStream());
      showSnackbar('Camera and microphone are ready', 'success');
    } catch (error) {
      console.error('Error opening media devices:', error);
      showSnackbar('Failed to access camera or microphone', 'error');
    }
  };

  // Create a new room
  const createRoom = async () => {
    try {
      setIsConnecting(true);
      showSnackbar('Creating room...', 'info');
      
      // Create a new peer connection
      const pc = new RTCPeerConnection(servers);
      setPeerConnection(pc);
      registerPeerConnectionListeners(pc);

      // Add local tracks to the peer connection
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });

      // Listen for remote tracks
      pc.addEventListener('track', event => {
        console.log('Got remote track:', event.streams[0]);
        event.streams[0].getTracks().forEach(track => {
          console.log('Add a track to the remoteStream:', track);
          remoteStream.addTrack(track);
        });
      });

      // Handle ICE candidates
      pc.addEventListener('icecandidate', event => {
        if (!event.candidate) {
          console.log('Got final candidate!');
          return;
        }
        console.log('Got candidate:', event.candidate);
        websocketService.sendIceCandidate(roomId, event.candidate.toJSON(), true);
      });

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      // Create room on signaling server
      const newRoomId = await websocketService.createRoom({
        type: offer.type,
        sdp: offer.sdp,
      });
      
      setRoomId(newRoomId);
      setIsCreator(true);
      showSnackbar(`Room created: ${newRoomId}`, 'success');
      
      // Listen for remote answer
      websocketService.onRoomAnswer(newRoomId, async (answer) => {
        console.log('Got remote description:', answer);
        const rtcSessionDescription = new RTCSessionDescription(answer);
        await pc.setRemoteDescription(rtcSessionDescription);
      });

      // Listen for remote ICE candidates
      websocketService.onIceCandidate(newRoomId, async (candidate) => {
        console.log(`Got new remote ICE candidate: ${JSON.stringify(candidate)}`);
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      });
      
    } catch (error) {
      console.error('Error creating room:', error);
      showSnackbar('Failed to create room', 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  // Join an existing room
  const joinRoom = async (roomIdToJoin) => {
    try {
      setDialogOpen(false);
      setIsConnecting(true);
      showSnackbar('Joining room...', 'info');
      
      // Create a new peer connection
      const pc = new RTCPeerConnection(servers);
      setPeerConnection(pc);
      registerPeerConnectionListeners(pc);
      
      // Add local tracks to the peer connection
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
      
      // Listen for remote tracks
      pc.addEventListener('track', event => {
        console.log('Got remote track:', event.streams[0]);
        event.streams[0].getTracks().forEach(track => {
          console.log('Add a track to the remoteStream:', track);
          remoteStream.addTrack(track);
        });
      });
      
      // Handle ICE candidates
      pc.addEventListener('icecandidate', event => {
        if (!event.candidate) {
          console.log('Got final candidate!');
          return;
        }
        console.log('Got candidate:', event.candidate);
        websocketService.sendIceCandidate(roomIdToJoin, event.candidate.toJSON(), false);
      });

      // Get remote description (offer)
      const offer = await websocketService.getRoomOffer(roomIdToJoin);
      
      if (!offer) {
        throw new Error('Room not found');
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      // Send answer to signaling server
      await websocketService.joinRoom(roomIdToJoin, {
        type: answer.type,
        sdp: answer.sdp,
      });
      
      // Listen for remote ICE candidates
      websocketService.onIceCandidate(roomIdToJoin, async (candidate) => {
        console.log(`Got new remote ICE candidate: ${JSON.stringify(candidate)}`);
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      });
      
      setRoomId(roomIdToJoin);
      setIsCreator(false);
      showSnackbar(`Joined room: ${roomIdToJoin}`, 'success');
      
    } catch (error) {
      console.error('Error joining room:', error);
      showSnackbar('Failed to join room', 'error');
    } finally {
      setIsConnecting(false);
    }
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      cleanUp();
    };
  }, []);

  return (
    <Root>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <StyledButton
            variant="contained"
            color="primary"
            startIcon={<VideocamIcon />}
            onClick={openUserMedia}
            disabled={cameraEnabled}
          >
            Open camera & microphone
          </StyledButton>
          
          <StyledButton
            variant="contained"
            color="primary"
            startIcon={<GroupAddIcon />}
            onClick={createRoom}
            disabled={!cameraEnabled || roomConnected || isConnecting}
          >
            Create room
          </StyledButton>
          
          <StyledButton
            variant="contained"
            color="primary"
            startIcon={<GroupIcon />}
            onClick={() => setDialogOpen(true)}
            disabled={!cameraEnabled || roomConnected || isConnecting}
          >
            Join room
          </StyledButton>
          
          <StyledButton
            variant="contained"
            color="secondary"
            startIcon={<CloseIcon />}
            onClick={cleanUp}
            disabled={!cameraEnabled}
          >
            Hangup
          </StyledButton>
        </Grid>
        
        {roomId && (
          <Grid item xs={12} component={CurrentRoom}>
            <Typography variant="subtitle1">
              Current room is {roomId} - You are the {isCreator ? 'caller' : 'callee'}!
            </Typography>
          </Grid>
        )}
        
        <Grid item xs={12} component={VideosContainer}>
          <VideoWrapper>
            <Typography variant="subtitle2" gutterBottom>Remote Stream</Typography>
            <VideoStream
              stream={remoteStream}
              muted={false}
              mirrored={false}
            />
          </VideoWrapper>
          
          <VideoWrapper>
            <Typography variant="subtitle2" gutterBottom>Your Stream</Typography>
            <VideoStream
              stream={localStream}
              muted={true}
              mirrored={true}
            />
          </VideoWrapper>
        </Grid>
      </Grid>
      
      <JoinRoomDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onJoin={joinRoom}
      />
      
      <Snackbar 
        open={snackbarOpen} 
        autoHideDuration={6000} 
        onClose={() => setSnackbarOpen(false)}
      >
        <Alert 
          onClose={() => setSnackbarOpen(false)} 
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Root>
  );
}

export default VideoRoom;