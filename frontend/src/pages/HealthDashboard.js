import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  CircularProgress,
  Chip,
  Card,
  CardContent,
  Alert,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  Memory as MemoryIcon,
  Speed as SpeedIcon,
  Storage as StorageIcon,
  Router as RouterIcon,
  Schedule as ScheduleIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function HealthDashboard() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const { enqueueSnackbar } = useSnackbar();

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/health`);
      if (!response.ok) {
        throw new Error('Failed to fetch health status');
      }
      const data = await response.json();
      setHealth(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (error) {
      console.error('Error fetching health status:', error);
      setError(error.message);
      enqueueSnackbar('Failed to fetch health status', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleIcon color="success" />;
      case 'degraded':
        return <WarningIcon color="warning" />;
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return <CircularProgress size={20} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy':
        return 'success';
      case 'degraded':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  if (loading && !health) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          System Health Status
        </Typography>
        <Box>
          <Tooltip title="Refresh Status">
            <IconButton onClick={fetchHealth} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {health && (
        <>
          {/* Overall Status */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box display="flex" alignItems="center" gap={2}>
              {getStatusIcon(health.status)}
              <Box>
                <Typography variant="h6">
                  Overall System Status: {health.status.toUpperCase()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Last updated: {lastUpdated?.toLocaleString()}
                </Typography>
              </Box>
            </Box>
          </Paper>

          <Grid container spacing={3}>
            {/* Core Services */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Core Services
              </Typography>
              <Grid container spacing={2}>
                {/* Server Status */}
                <Grid item xs={12} md={4}>
                  <Card>
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        <RouterIcon color="primary" />
                        <Typography variant="h6">Server</Typography>
                      </Box>
                      <Typography variant="body2" gutterBottom>
                        Port: {health.services.server.port}
                      </Typography>
                      <Typography variant="body2" gutterBottom>
                        Uptime: {Math.floor(health.uptime / 3600)} hours
                      </Typography>
                      <Typography variant="body2">
                        Node: {health.services.server.node_version}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Telnyx Status */}
                <Grid item xs={12} md={4}>
                  <Card>
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        <PhoneIcon color="primary" />
                        <Typography variant="h6">Telnyx</Typography>
                        <Chip 
                          size="small"
                          label={health.services.telnyx.status}
                          color={getStatusColor(health.services.telnyx.status)}
                        />
                      </Box>
                      <Typography variant="body2" gutterBottom>
                        SMS: {health.services.telnyx.features.sms ? 'Enabled' : 'Disabled'}
                      </Typography>
                      <Typography variant="body2" gutterBottom>
                        Voice: {health.services.telnyx.features.voice ? 'Enabled' : 'Disabled'}
                      </Typography>
                      <Typography variant="body2">
                        AI Assistant: {health.services.telnyx.features.ai_assistant ? 'Enabled' : 'Disabled'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* SendGrid Status */}
                <Grid item xs={12} md={4}>
                  <Card>
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        <EmailIcon color="primary" />
                        <Typography variant="h6">SendGrid</Typography>
                        <Chip 
                          size="small"
                          label={health.services.sendgrid.status}
                          color={getStatusColor(health.services.sendgrid.status)}
                        />
                      </Box>
                      <Typography variant="body2" gutterBottom>
                        Email: {health.services.sendgrid.features.emergency_email ? 'Enabled' : 'Disabled'}
                      </Typography>
                      <Typography variant="body2">
                        Notifications: {health.services.sendgrid.features.notifications ? 'Enabled' : 'Disabled'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Grid>

            {/* System Resources */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                System Resources
              </Typography>
              <Grid container spacing={2}>
                {/* Memory Usage */}
                <Grid item xs={12} md={4}>
                  <Card>
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        <MemoryIcon color="primary" />
                        <Typography variant="h6">Memory</Typography>
                      </Box>
                      <Typography variant="body2" gutterBottom>
                        Heap Used: {health.system.memory.heapUsed}
                      </Typography>
                      <Typography variant="body2" gutterBottom>
                        Heap Total: {health.system.memory.heapTotal}
                      </Typography>
                      <Typography variant="body2">
                        RSS: {health.system.memory.rss}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* CPU Info */}
                <Grid item xs={12} md={4}>
                  <Card>
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        <SpeedIcon color="primary" />
                        <Typography variant="h6">CPU</Typography>
                      </Box>
                      <Typography variant="body2" gutterBottom>
                        Architecture: {health.system.cpu.arch}
                      </Typography>
                      <Typography variant="body2" gutterBottom>
                        CPUs: {health.system.cpu.cpus}
                      </Typography>
                      <Typography variant="body2">
                        Load Avg: {health.system.cpu.load_average.map(load => load.toFixed(2)).join(', ')}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                {/* Network Info */}
                <Grid item xs={12} md={4}>
                  <Card>
                    <CardContent>
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        <RouterIcon color="primary" />
                        <Typography variant="h6">Network</Typography>
                      </Box>
                      <Typography variant="body2" gutterBottom>
                        Hostname: {health.system.network.hostname}
                      </Typography>
                      <Typography variant="body2">
                        Interfaces: {health.system.network.network_interfaces}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Grid>

            {/* Response Time */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={1} mb={2}>
                    <ScheduleIcon color="primary" />
                    <Typography variant="h6">Performance</Typography>
                  </Box>
                  <Typography variant="body2" gutterBottom>
                    Response Time: {health.responseTime}ms
                  </Typography>
                  <Typography variant="body2">
                    Environment: {health.environment}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}
    </Container>
  );
}

export default HealthDashboard; 