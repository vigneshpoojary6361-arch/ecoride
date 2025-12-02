// User Dashboard functionality (updated)
document.addEventListener('DOMContentLoaded', function() {
    // Initialize dashboard if on user dashboard page
    if (window.location.pathname.includes('dashboard-user')) {
        initUserDashboard();
    }
});

let notifications = [];
// --- API Request Helper ---
// This function automatically includes the token and JSON headers
async function apiRequest(url, options = {}) {
    const token = localStorage.getItem('token'); // stored at login

    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            ...defaultHeaders,
            ...(options.headers || {})
        }
    });

    const contentType = response.headers.get('content-type') || '';

    // Handle non-JSON (likely HTML error)
    if (!response.ok) {
        const text = await response.text();
        if (contentType.includes('text/html')) {
            throw new Error('Server returned HTML instead of JSON — you may not be logged in.');
        }
        throw new Error(text || 'Request failed');
    }

    if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error('Invalid JSON response: ' + text);
    }

    return response.json();
}

function initUserDashboard() {
    // Load initial data
    // Initialize Leaflet Map
   
    loadMyRides();
    loadMyBookings();
    loadUserProfile();
    loadNotifications();
    
    // Set today's date as minimum for search and offer forms
    const today = new Date().toISOString().split('T')[0];
    const sd = document.getElementById('searchDate');
    const od = document.getElementById('offerDate');
    if (sd) sd.setAttribute('min', today);
    if (od) od.setAttribute('min', today);

    // Bind event handlers
    bindEventHandlers();
    
    // Poll for new notifications every 30 seconds
    setInterval(loadNotifications, 30000);
}

function bindEventHandlers() {
    // Search form
    const searchForm = document.getElementById('searchForm');
    if (searchForm) searchForm.addEventListener('submit', handleSearchRides);
    
    // Offer ride form
    const offerForm = document.getElementById('offerForm');
    if (offerForm) offerForm.addEventListener('submit', handleOfferRide);
    
    // Profile form submit handler
    const profileForm = document.getElementById('profileForm');
    if (profileForm) profileForm.addEventListener('submit', handleUpdateProfile);
    
    // Edit profile toggle (fix for "Edit Profile" button not working)
    const editBtn = document.getElementById('editProfileBtn');
    if (editBtn) editBtn.addEventListener('click', toggleEditProfile);
    
    // Tab change handlers
    const myRidesTab = document.getElementById('my-rides-tab');
    const bookingsTab = document.getElementById('bookings-tab');
    const profileTab = document.getElementById('profile-tab');
    if (myRidesTab) myRidesTab.addEventListener('click', loadMyRides);
    if (bookingsTab) bookingsTab.addEventListener('click', loadMyBookings);
    if (profileTab) profileTab.addEventListener('click', loadUserProfile);
}

// Search rides functionality with nearby matches
async function handleSearchRides(e) {
    e.preventDefault();

    const from = document.getElementById('searchFrom').value;
    const to = document.getElementById('searchTo').value;
    const date = document.getElementById('searchDate').value;
    const minSeats = document.getElementById('searchMinSeats').value;
    const minPrice = document.getElementById('searchMinPrice').value;
    const maxPrice = document.getElementById('searchMaxPrice').value;

    const container = document.getElementById('searchResults');

    // ✅ Add the loading class (for CSS fade effect)
    container.classList.add('loading');

    // ✅ Show spinner immediately
    container.innerHTML = `
        <div class="text-center mt-4">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2 fw-semibold text-muted">Searching rides...</p>
        </div>
    `;

    try {
        const params = new URLSearchParams();
        if (from) params.append('from', from);
        if (to) params.append('to', to);
        if (date) params.append('date', date);
        if (minSeats) params.append('minSeats', minSeats);
        if (minPrice) params.append('minPrice', minPrice);
        if (maxPrice) params.append('maxPrice', maxPrice);

        const result = await apiRequest(`/api/rides/search?${params.toString()}`);

        // ✅ Remove loading effect before displaying results
        container.classList.remove('loading');

        // ✅ Replace loading message with actual results
        displaySearchResults(result.exactMatches || [], result.nearbyMatches || []);
    } catch (error) {
        // ❌ Show error message
        container.classList.remove('loading');
        container.innerHTML = `
            <div class="text-center text-danger mt-3">
                <i class="fas fa-exclamation-triangle fa-2x mb-2"></i>
                <p>Failed to fetch rides. Please try again.</p>
            </div>
        `;
        console.error('Search error:', error);
    }
}

// Clear search filters
function clearSearchFilters() {
    document.getElementById('searchFrom').value = '';
    document.getElementById('searchTo').value = '';
    document.getElementById('searchDate').value = '';
    document.getElementById('searchMinSeats').value = '';
    document.getElementById('searchMinPrice').value = '';
    document.getElementById('searchMaxPrice').value = '';
    document.getElementById('searchResults').innerHTML = '';
}

function displaySearchResults(exactMatches, nearbyMatches) {
    const container = document.getElementById('searchResults');

    // ❌ No map resetting or plotting here anymore
    // We’ll only show the map when the user clicks “View Map”

    if (exactMatches.length === 0 && nearbyMatches.length === 0) {
        container.innerHTML = `
            <div class="empty-state text-center">
                <i class="fas fa-search fa-2x mb-2 text-muted"></i>
                <h4>No rides found</h4>
                <p>Try adjusting your search criteria or check nearby options</p>
            </div>
        `;
        return;
    }

    let html = '';

    // ✅ Perfect matches
    if (exactMatches.length > 0) {
        html += `
            <div class="mb-4">
                <h5 class="text-success">
                    <i class="fas fa-check-circle me-2"></i>Perfect Matches
                </h5>
                ${exactMatches.map(ride => renderRideCard(ride, false)).join('')}
            </div>
        `;
    }

    // ✅ Nearby matches
    if (nearbyMatches.length > 0) {
        html += `
            <div class="mb-4">
                <h5 class="text-info">
                    <i class="fas fa-map-marked-alt me-2"></i>Nearby Options 
                </h5>
                <p class="text-muted small">
                    These rides have pickup/dropoff locations near your search
                </p>
                ${nearbyMatches.map(ride => renderRideCard(ride, true)).join('')}
            </div>
        `;
    }

    container.innerHTML = html;
}

function renderRideCard(ride, isNearby) {
    const availableSeats = ride.actualAvailableSeats !== undefined ? ride.actualAvailableSeats : ride.availableSeats;

    // ✅ FIX: vehicle details come from ride, not driver
    const vehicleModel = ride.vehicleModel || 'N/A';
    const vehicleImage = ride.vehiclePhoto
        ? (ride.vehiclePhoto.startsWith('/uploads/')
            ? ride.vehiclePhoto
            : `/uploads/${ride.vehiclePhoto}`)
        : 'https://via.placeholder.com/150?text=No+Image';

    return `
        <div class="card ride-card mb-3 ${isNearby ? 'border-info' : ''}">
            <div class="card-body">
                <div class="row align-items-center">
                    <!-- LEFT: Ride Details -->
                    <div class="col-md-8">
                        <h6 class="card-title">
                            <i class="fas fa-map-marker-alt text-success me-1"></i>
                            ${ride.from} → ${ride.to}
                            ${ride.averageRating > 0 ? `
                                <span class="ms-2">
                                    <i class="fas fa-star text-warning"></i> ${ride.averageRating.toFixed(1)}
                                    <small class="text-muted">(${ride.reviews ? ride.reviews.length : 0})</small>
                                </span>
                            ` : ''}
                        </h6>

                        ${isNearby && ride.fromDistance !== undefined ? `
                            <div class="mb-2">
                                <span class="badge bg-info">
                                    <i class="fas fa-route me-1"></i>
                                    Pickup: ${ride.fromDistance.toFixed(1)} km away
                                </span>
                                <span class="badge bg-info ms-1">
                                    <i class="fas fa-flag-checkered me-1"></i>
                                    Dropoff: ${ride.toDistance.toFixed(1)} km away
                                </span>
                            </div>
                        ` : ''}

                        <p class="card-text">
                            <small class="text-muted">
                                <i class="fas fa-calendar me-1"></i>
                                ${new Date(ride.departureDate).toLocaleDateString()} at ${ride.departureTime}
                            </small>
                        </p>

                        <p class="card-text">
                            <i class="fas fa-user me-1"></i> Driver: ${ride.driver?.name || 'Unknown'}<br>
                            <i class="fas fa-envelope me-1"></i> ${ride.driver?.email || 'N/A'}<br>
                            <i class="fas fa-phone me-1"></i> ${ride.driver?.phone || 'N/A'}<br>
                            <i class="fas fa-car me-1"></i> ${ride.vehicleNumber || 'N/A'}<br>
                            <i class="fas fa-car-side me-1"></i> Model: ${vehicleModel}<br>
                            <i class="fas fa-users me-1"></i> Available seats: ${availableSeats}<br>
                            <i class="fa-solid fa-indian-rupee-sign me-1"></i> ₹${ride.pricePerSeat} per seat
                        </p>
                    </div>

                    <!-- RIGHT: Vehicle Image + Buttons -->
                    <div class="col-md-4 text-end">
                        <img src="${vehicleImage}" 
                            alt="Vehicle Image" 
                            class="img-fluid rounded mb-2 vehicle-thumbnail" 
                            style="max-height:120px; object-fit:cover; border: 1px solid #ccc; cursor: pointer;"
                            onclick="showVehicleImage('${vehicleImage}')">
                        
                        <button type="button" class="btn btn-outline-primary btn-sm mt-2" 
                                onclick="showRideMap('${ride.from}', '${ride.to}', '${ride._id}')">
                            <i class="fas fa-map-marked-alt me-1"></i> View Map
                        </button>

                        ${availableSeats > 0 ? `
                            <button type="button" class="btn btn-success btn-sm mt-2" onclick="bookRide('${ride._id}')">
                                <i class="fas fa-ticket-alt me-1"></i> Book Ride
                            </button>
                        ` : `
                            <span class="badge bg-secondary mt-2">No Seats Available</span>
                        `}
                    </div>
                </div>
            </div>
        </div>  
    `;
}
// Book ride functionality
async function bookRide(rideId) {
    try {
        await apiRequest(`/api/rides/${rideId}/book`, { 
            method: 'POST',
            body: JSON.stringify({ seats: 1 })
        });
        showAlert('Booking request sent! The driver will review your request.', 'success');
        
        // Refresh search results and bookings
        //document.getElementById('searchForm').dispatchEvent(new Event('submit'));
        loadMyBookings();
    } catch (error) {
        showAlert('Error booking ride: ' + error.message, 'danger');
    }
}

// Offer ride functionality
async function handleOfferRide(e) {
  e.preventDefault();

  const form = document.getElementById('offerForm');
  const formData = new FormData();

  // Append all text fields
  formData.append('from', document.getElementById('offerFrom').value.trim());
  formData.append('to', document.getElementById('offerTo').value.trim());
  formData.append('departureDate', document.getElementById('offerDate').value);
  formData.append('departureTime', document.getElementById('offerTime').value);
  formData.append('availableSeats', document.getElementById('offerSeats').value);
  formData.append('pricePerSeat', document.getElementById('offerPrice').value);
  formData.append('description', document.getElementById('offerDescription').value.trim());
  formData.append('vehicleModel', document.getElementById('offerVehicleModel').value.trim());
  formData.append(
    'vehicleNumber',
    document.getElementById('offerVehicleNumber').value.toUpperCase().replace(/\s+/g, '')
  );

  // Append the uploaded image file
  const vehiclePhoto = document.getElementById('offerVehiclePhoto').files[0];
  if (vehiclePhoto) formData.append('vehiclePhoto', vehiclePhoto);

  try {
    const response = await fetch('/api/rides', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}` // keep auth header
      },
      body: formData // send as multipart/form-data
    });

    const result = await response.json();

    if (!response.ok) throw new Error(result.message || 'Failed to create ride');

    showAlert('✅ Ride offered successfully!', 'success', 'offerAlert');
    form.reset();
    document.getElementById('vehiclePreview').classList.add('d-none');
    loadMyRides();
  } catch (error) {
    console.error('❌ Error creating ride:', error);
    showAlert('Error creating ride: ' + error.message, 'danger', 'offerAlert');
  }
}
// Load user's rides with booking requests management
async function loadMyRides() {
  const container = document.getElementById('myRidesContainer');

  try {
    container.innerHTML = `
      <div class="text-center">
        <i class="fas fa-spinner fa-spin fa-2x text-muted"></i>
        <p class="mt-2 text-muted">Loading your rides...</p>
      </div>
    `;

    const rides = await apiRequest('/api/rides/my-rides');

    if (!rides || rides.length === 0) {
      container.innerHTML = `
        <div class="empty-state text-center">
          <i class="fas fa-car fa-2x mb-2 text-muted"></i>
          <h4>No rides offered yet</h4>
          <p>Create your first ride to start carpooling</p>
        </div>
      `;
      return;
    }

    const ridesHtml = rides.map(ride => {
      const pendingRequests = ride.passengers.filter(p => p.status === 'pending');
      const acceptedPassengers = ride.passengers.filter(p => p.status === 'accepted');
      const acceptedSeats = acceptedPassengers.reduce((sum, p) => sum + (p.bookedSeats || 0), 0);
      const actualAvailable = (ride.availableSeats || 0) - acceptedSeats;

      return `
        <div class="card ride-card mb-3">
          <div class="card-body">
            <div class="row">
              <div class="col-md-8">
                <h6 class="card-title">
                  <i class="fas fa-map-marker-alt text-success me-1"></i>
                  ${ride.from} → ${ride.to}
                </h6>
                <p class="card-text">
                  <small class="text-muted">
                    <i class="fas fa-calendar me-1"></i>
                    ${new Date(ride.departureDate).toLocaleDateString()} at ${ride.departureTime}
                  </small>
                </p>

                <div class="row">
                  <!-- Left column: ride info -->
                  <div class="col-md-8">
                    <p class="card-text">
                      <i class="fas fa-user me-1"></i> Driver: ${ride.driver?.name || 'Unknown'}<br>
                      <i class="fas fa-envelope me-1"></i> ${ride.driver?.email || 'N/A'}<br>
                      <i class="fas fa-phone me-1"></i> ${ride.driver?.phone || 'N/A'}<br>
                      <i class="fas fa-car me-1"></i> ${ride.vehicleNumber || 'N/A'}<br>
                      <i class="fas fa-cogs me-1"></i> ${ride.vehicleModel || 'N/A'}<br>
                      <i class="fas fa-users me-1"></i> Available: ${actualAvailable} | Accepted: ${acceptedPassengers.length} (${acceptedSeats} seats)
                      ${pendingRequests.length > 0 ? `<br><i class="fas fa-clock me-1 text-warning"></i> Pending Requests: ${pendingRequests.length}` : ''}
                      <br>
                      <i class="fa-solid fa-indian-rupee-sign me-1"></i> ₹${ride.pricePerSeat} per seat
                    </p>
                  </div>

                  <!-- Right column: vehicle photo -->
                  <div class="col-md-4 d-flex flex-column align-items-center justify-content-center">
                    ${ride.vehiclePhoto ? `
                      <img 
                        src="${ride.vehiclePhoto}" 
                        alt="Vehicle Photo" 
                        class="img-fluid rounded shadow-sm mb-2" 
                        style="max-width: 180px; cursor:pointer;" 
                        onclick="showVehicleModal('${ride.vehiclePhoto}')"
                      >
                    ` : ''}
                    
                    <!-- ✅ View Map button -->
                    <button class="btn btn-outline-primary btn-sm mt-1" 
                            onclick="showRideMap('${ride.from}', '${ride.to}', '${ride._id}')">
                      <i class="fas fa-map-marked-alt me-1"></i> View Map
                    </button>
                  </div>
                </div>

                <div class="mt-2">
                  <span class="badge bg-${ride.status === 'active' ? 'success' : ride.status === 'completed' ? 'secondary' : 'warning'}">
                    ${ride.status}
                  </span>
                </div>
              </div>

              <!-- Right-side action buttons -->
              <div class="col-md-4 text-end">
                ${ride.status === 'active' ? `
                  <button class="btn btn-primary btn-sm mb-1" onclick="completeRide('${ride._id}')">
                    <i class="fas fa-check me-1"></i> Complete Ride
                  </button>
                ` : ''}
                <button class="btn btn-danger btn-sm" onclick="deleteRide('${ride._id}')">
                  <i class="fas fa-trash me-1"></i> Delete
                </button>
              </div>
            </div>

            ${pendingRequests.length > 0 || acceptedPassengers.length > 0 ? `
              <div class="mt-3">
                ${acceptedPassengers.length > 0 ? `
                  <h6 class="text-success"><i class="fas fa-check-circle me-1"></i> Accepted Passengers:</h6>
                  ${acceptedPassengers.map(p => `
                    <div class="card bg-light mb-2">
                      <div class="card-body p-3">
                        <div class="row align-items-center">
                          <div class="col-md-8">
                            <strong>${p.user?.name || 'Unknown'}</strong><br>
                            <small class="text-muted">
                              <i class="fas fa-envelope me-1"></i> ${p.user?.email || 'N/A'}<br>
                              <i class="fas fa-phone me-1"></i> ${p.user?.phone || 'N/A'}<br>
                              <i class="fas fa-users me-1"></i> ${p.bookedSeats || 1} seat(s)<br>
                              <i class="fas fa-clock me-1"></i> ${p.bookedAt ? new Date(p.bookedAt).toLocaleString() : 'N/A'}
                            </small>
                          </div>
                          <div class="col-md-4 text-end">
                            <span class="badge bg-success">Accepted</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                ` : ''}
                
                ${pendingRequests.length > 0 ? `
                  <h6 class="text-warning mt-3"><i class="fas fa-bell me-1"></i> Pending Booking Requests:</h6>
                  ${pendingRequests.map(p => `
                    <div class="card bg-light mb-2">
                      <div class="card-body p-3">
                        <div class="row align-items-center">
                          <div class="col-md-8">
                            <strong>${p.user?.name || 'Unknown'}</strong><br>
                            <small class="text-muted">
                              <i class="fas fa-envelope me-1"></i> ${p.user?.email || 'N/A'}<br>
                              <i class="fas fa-phone me-1"></i> ${p.user?.phone || 'N/A'}<br>
                              <i class="fas fa-users me-1"></i> Requested ${p.bookedSeats || 1} seat(s)<br>
                              <i class="fas fa-clock me-1"></i> ${p.bookedAt ? new Date(p.bookedAt).toLocaleString() : 'N/A'}
                            </small>
                          </div>
                          <div class="col-md-4 text-end">
                            <button class="btn btn-success btn-sm me-1" 
                                    onclick="acceptBooking('${ride._id}', '${p._id || (p.user?._id || p.user)}')">
                              <i class="fas fa-check me-1"></i> Accept
                            </button>
                            <button class="btn btn-danger btn-sm" 
                                    onclick="rejectBooking('${ride._id}', '${p._id || (p.user?._id || p.user)}')">
                              <i class="fas fa-times me-1"></i> Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                ` : ''}
              </div>
            ` : ''}

            ${ride.reviews && ride.reviews.length > 0 ? `
              <div class="mt-3">
                <h6 class="text-info"><i class="fas fa-star me-1"></i> Reviews from Passengers:</h6>
                ${ride.reviews.map(r => `
                  <div class="card bg-light mb-2">
                    <div class="card-body p-3">
                      <strong>${r.user?.name || 'Anonymous'}</strong>
                      <span class="badge bg-warning text-dark ms-2">
                        <i class="fas fa-star"></i> ${r.rating}
                      </span>
                      ${r.comment ? `<p class="mt-1 mb-0"><small>${r.comment}</small></p>` : ''}
                      <small class="text-muted d-block mt-1">${r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</small>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = ridesHtml.join('');

  } catch (error) {
    container.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle me-1"></i>
        Error loading rides: ${error.message}
      </div>
    `;
  }
}

function showVehicleModal(src) {
  const modalImage = document.getElementById('modalVehicleImage');
  modalImage.src = src;
  const modal = new bootstrap.Modal(document.getElementById('vehicleImageModal'));
  modal.show();
}

// ✅ Accept booking
async function acceptBooking(rideId, passengerId) {
  try {

    const response = await apiRequest(`/api/rides/${rideId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passengerId }), // send passengerId properly
    });

    console.log("✅ Accept response:", response);
    showAlert(response.message || "Booking accepted successfully!", "success");
    loadMyRides(); // refresh rides
  } catch (error) {
    console.error("❌ Accept booking error:", error);
    showAlert("Error accepting booking: " + error.message, "danger");
  }
}

// 🚫 Reject booking
async function rejectBooking(rideId, passengerId) {
  try {

    const response = await apiRequest(`/api/rides/${rideId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passengerId }), // send passengerId properly
    });

    console.log("✅ Reject response:", response);
    showAlert(response.message || "Booking rejected successfully!", "warning");
    loadMyRides();
  } catch (error) {
    console.error("❌ Reject booking error:", error);
    showAlert("Error rejecting booking: " + error.message, "danger");
  }
}

// Complete ride
async function completeRide(rideId) {
    if (!confirm('Mark this ride as completed? Passengers will be able to leave reviews.')) {
        return;
    }
    
    try {
        await apiRequest(`/api/rides/${rideId}/complete`, { method: 'POST' });
        showAlert('Ride marked as completed!', 'success');
        loadMyRides();
    } catch (error) {
        showAlert('Error completing ride: ' + error.message, 'danger');
    }
}

// Load user's bookings with status
async function loadMyBookings() {
  const container = document.getElementById('bookingsContainer');
  
  try {
    container.innerHTML = `
      <div class="text-center">
        <i class="fas fa-spinner fa-spin fa-2x text-muted"></i>
        <p class="mt-2 text-muted">Loading your bookings...</p>
      </div>
    `;
    
    const rides = await apiRequest('/api/rides/my-bookings');
    
    if (rides.length === 0) {
      container.innerHTML = `
        <div class="empty-state text-center">
          <i class="fas fa-ticket-alt fa-2x mb-2 text-muted"></i>
          <h4>No bookings yet</h4>
          <p>Search and book your first ride</p>
        </div>
      `;
      return;
    }
    
    const bookingsHtml = rides.map(ride => {
      const status = ride.userBookingStatus || 'pending';
      const bookedSeats = ride.userBookedSeats || 1;
      const hasReviewed = ride.reviews && ride.reviews.some(r => r.user._id === getUserData().id);
      const canReview = ride.status === 'completed' && status === 'accepted' && !hasReviewed;
      
      const statusBadgeClass = {
        'pending': 'bg-warning',
        'accepted': 'bg-success',
        'rejected': 'bg-danger'
      }[status] || 'bg-secondary';
      
      return `
        <div class="card ride-card mb-3">
          <div class="card-body">
            <div class="row">
              <!-- LEFT COLUMN -->
              <div class="col-md-8">
                <h6 class="card-title">
                  <i class="fas fa-map-marker-alt text-success me-1"></i>
                  ${ride.from} → ${ride.to}
                  ${ride.averageRating > 0 ? `
                    <span class="ms-2">
                      <i class="fas fa-star text-warning"></i> ${ride.averageRating.toFixed(1)}
                    </span>
                  ` : ''}
                </h6>
                <p class="card-text">
                  <small class="text-muted">
                    <i class="fas fa-calendar me-1"></i>
                    ${new Date(ride.departureDate).toLocaleDateString()} at ${ride.departureTime}
                  </small>
                </p>

                <p class="card-text">
                  <i class="fas fa-user me-1"></i> Driver: ${ride.driverInfo?.name || 'Unknown'}<br>
                  <i class="fas fa-envelope me-1"></i> ${ride.driverInfo?.email || 'N/A'}<br>
                  <i class="fas fa-phone me-1"></i> ${ride.driverInfo?.phone || 'N/A'}<br>
                  <i class="fas fa-car me-1"></i> ${ride.driverInfo?.vehicleNumber || 'N/A'}<br>
                  <i class="fas fa-cogs me-1"></i> ${ride.vehicleModel || 'N/A'}<br>
                  <i class="fas fa-users me-1"></i> Your seats: ${bookedSeats}<br>
                  <i class="fa-solid fa-indian-rupee-sign me-1"></i> Total: ₹${(ride.pricePerSeat * bookedSeats).toFixed(2)}
                </p>
              </div>

              <!-- RIGHT COLUMN -->
              <div class="col-md-4 d-flex flex-column align-items-center justify-content-center">
                ${ride.vehiclePhoto ? `
                  <img 
                    src="${ride.vehiclePhoto}" 
                    alt="Vehicle Photo" 
                    class="img-fluid rounded shadow-sm mb-2"
                    style="max-width: 180px; cursor:pointer;"
                    onclick="showVehicleModal('${ride.vehiclePhoto}')"
                  >
                ` : ''}

                <!-- ✅ New View Map Button -->
                <button class="btn btn-outline-primary btn-sm mt-1"
                        onclick="showRideMap('${ride.from}', '${ride.to}', '${ride._id}')">
                  <i class="fas fa-map-marked-alt me-1"></i> View Map
                </button>
              </div>
            </div>

            <div class="mt-2">
              <span class="badge bg-${ride.status === 'active' ? 'info' : 'secondary'}">${ride.status}</span>
              <span class="badge ${statusBadgeClass} ms-1">${status}</span>
            </div>

            <div class="col-md-12 text-end mt-2">
              ${ride.status === 'active' && status === 'pending' ? `
                <button class="btn btn-warning btn-sm" onclick="cancelBooking('${ride._id}')">
                  <i class="fas fa-times me-1"></i> Cancel Request
                </button>
              ` : ''}
              ${canReview ? `
                <button class="btn btn-primary btn-sm mt-1" onclick="showReviewModal('${ride._id}')">
                  <i class="fas fa-star me-1"></i> Leave Review
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    container.innerHTML = bookingsHtml;
  } catch (error) {
    container.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle me-1"></i>
        Error loading bookings: ${error.message}
      </div>
    `;
  }
}

// Delete ride
async function deleteRide(rideId) {
    if (!confirm('Are you sure you want to delete this ride?')) {
        return;
    }
    
    try {
        await apiRequest(`/api/rides/${rideId}`, { method: 'DELETE' });
        showAlert('Ride deleted successfully!', 'success');
        loadMyRides();
    } catch (error) {
        showAlert('Error deleting ride: ' + error.message, 'danger');
    }
}

// Cancel booking
async function cancelBooking(rideId) {
    if (!confirm('Are you sure you want to cancel this booking?')) {
        return;
    }
    
    try {
        const response = await apiRequest(`/api/rides/${rideId}/cancel`, { method: 'POST' });
        showAlert(response.message || 'Booking cancelled successfully!', 'success');
        loadMyBookings();
    } catch (error) {
        showAlert('Error cancelling booking: ' + error.message, 'danger');
    }
}

// Show review modal
function showReviewModal(rideId) {
    const modalHtml = `
        <div class="modal fade" id="reviewModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Leave a Review</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="reviewForm">
                            <input type="hidden" id="reviewRideId" value="${rideId}">
                            <div class="mb-3">
                                <label class="form-label">Rating *</label>
                                <div class="rating-stars">
                                    ${[1,2,3,4,5].map(star => `
                                        <i class="fas fa-star rating-star text-muted" data-rating="${star}" onclick="selectRating(${star})" style="cursor: pointer; font-size: 2rem;"></i>
                                    `).join('')}
                                </div>
                                <input type="hidden" id="reviewRating" required>
                            </div>
                            <div class="mb-3">
                                <label for="reviewComment" class="form-label">Comment (Optional)</label>
                                <textarea class="form-control" id="reviewComment" rows="3" placeholder="Share your experience..."></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-success" onclick="submitReview()">Submit Review</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = new bootstrap.Modal(document.getElementById('reviewModal'));
    modal.show();
    
    document.getElementById('reviewModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

// Select rating
function selectRating(rating) {
    document.getElementById('reviewRating').value = rating;
    document.querySelectorAll('.rating-star').forEach((star, index) => {
        if (index < rating) {
            star.classList.add('text-warning');
            star.classList.remove('text-muted');
        } else {
            star.classList.remove('text-warning');
            star.classList.add('text-muted');
        }
    });
}

// Submit review
async function submitReview() {
    const rideId = document.getElementById('reviewRideId').value;
    const rating = document.getElementById('reviewRating').value;
    const comment = document.getElementById('reviewComment').value;
    
    if (!rating) {
        alert('Please select a rating');
        return;
    }
    
    try {
        await apiRequest(`/api/rides/${rideId}/review`, {
            method: 'POST',
            body: JSON.stringify({ rating: parseInt(rating), comment })
        });
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('reviewModal'));
        modal.hide();
        
        showAlert('Review submitted successfully!', 'success');
        loadMyBookings();
    } catch (error) {
        showAlert('Error submitting review: ' + error.message, 'danger');
    }
}

// Load user profile
async function loadUserProfile() {
    try {
        const user = await apiRequest('/api/users/profile');
        
        document.getElementById('profileName').value = user.name || '';
        document.getElementById('profileEmail').value = user.email || '';
        document.getElementById('profilePhone').value = user.phone || '';
        document.getElementById('profileRole').value = user.role === 'admin' ? 'Administrator' : 'User';

        // Update displayed name
        const displayNameEl = document.getElementById('userName');
        if (displayNameEl) displayNameEl.textContent = user.name || 'User';
    } catch (error) {
        showAlert('Error loading profile: ' + error.message, 'danger', 'profileAlert');
    }
}


// Update user profile
async function handleUpdateProfile(e) {
    // If this was triggered by our manual dispatchEvent from toggleEditProfile, it will have no submit event object
    if (e && e.preventDefault) e.preventDefault();

    const profileData = {
        name: document.getElementById('profileName').value,
        // NOTE: backend currently only accepts name and phone in updateUser controller
        phone: document.getElementById('profilePhone').value
    };

    try {
        const updatedResponse = await apiRequest('/api/users/profile', { 
            method: 'PUT',
            body: JSON.stringify(profileData)
        });

        // updatedResponse contains message and user object (see controller)
        const updatedUser = updatedResponse.user || updatedResponse;

        // Update stored user data if using localStorage
        try {
            const currentUserData = JSON.parse(localStorage.getItem('userData') || '{}');
            currentUserData.name = updatedUser.name || currentUserData.name;
            currentUserData.email = updatedUser.email || currentUserData.email;
            localStorage.setItem('userData', JSON.stringify(currentUserData));
        } catch (err) {
            // ignore localStorage errors
        }

        // Update display name
        const nameDisplay = document.getElementById('userName');
        if (nameDisplay && updatedUser.name) nameDisplay.textContent = updatedUser.name;

        showAlert('Profile updated successfully!', 'success', 'profileAlert');

        // Exit edit mode
        exitEditMode();
    } catch (error) {
        showAlert('Error updating profile: ' + error.message, 'danger', 'profileAlert');
    }
}


// Enable editing of name and phone
function toggleEditProfile() {
    const inputs = document.querySelectorAll('#profileForm input');
    const editBtn = document.getElementById('editProfileBtn');
    const saveBtn = document.getElementById('saveProfileBtn');

    inputs.forEach(input => {
        if (input.id === 'profileName' || input.id === 'profilePhone') {
            input.removeAttribute('readonly');
            input.classList.add('editable');
        }
    });

    if (editBtn) editBtn.classList.add('d-none');
    if (saveBtn) saveBtn.classList.remove('d-none');
}

// Disable editing after save
function exitEditMode() {
    const inputs = document.querySelectorAll('#profileForm input');
    const editBtn = document.getElementById('editProfileBtn');
    const saveBtn = document.getElementById('saveProfileBtn');

    inputs.forEach(input => {
        input.setAttribute('readonly', true);
        input.classList.remove('editable');
    });

    if (editBtn) editBtn.classList.remove('d-none');
    if (saveBtn) saveBtn.classList.add('d-none');
}

// Fetch notifications from backend
async function loadNotifications() {
    try {
        const notifs = await apiRequest('/api/notifications');
        notifications = notifs;
        updateNotificationUI();
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

// Toggle notifications panel
function toggleNotifications() {
    const panel = document.getElementById('notificationPanel');
    const isHidden = panel.classList.contains('d-none');
    
    if (isHidden) {
        loadNotifications(); // Refresh notifications when opening
        panel.classList.remove('d-none');
        panel.style.display = 'block';
        panel.style.position = 'absolute';
        panel.style.top = '100%';
        panel.style.right = '0';
        panel.style.zIndex = '1000';
        
        // Mark all as read after a short delay
        setTimeout(() => {
            apiRequest('/api/notifications/read-all', { method: 'PUT' }).catch(() => {});
            // refresh badge after marking as read
            setTimeout(updateUnreadCountBadge, 2000);
        }, 2000);
    } else {
        panel.classList.add('d-none');
    }
}

// Update notification UI
function updateNotificationUI() {
    const badge = document.getElementById('notificationBadge');
    const list = document.getElementById('notificationList');
    
    const unreadCount = notifications.filter(n => !n.isRead).length;
    
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('d-none');
    } else {
        badge.classList.add('d-none');
    }
    
    if (notifications.length > 0) {
        list.innerHTML = notifications.slice(0, 10).map(notif => `
            <div class="notification-item border-bottom pb-2 mb-2 ${notif.isRead ? '' : 'bg-light'}" style="padding: 8px; border-radius: 4px;">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center mb-1">
                            ${getNotificationIcon(notif.type)}
                            <strong class="ms-2">${getNotificationTitle(notif.type)}</strong>
                        </div>
                        <small class="text-muted d-block">${notif.message}</small>
                        <small class="text-muted">${getTimeAgo(new Date(notif.createdAt).getTime())}</small>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        list.innerHTML = '<p class="text-muted text-center small">No notifications</p>';
    }
}

function getNotificationIcon(type) {
    const icons = {
        'booking_request': '<i class="fas fa-bell text-warning"></i>',
        'booking_accepted': '<i class="fas fa-check-circle text-success"></i>',
        'booking_rejected': '<i class="fas fa-times-circle text-danger"></i>',
        'ride_completed': '<i class="fas fa-flag-checkered text-info"></i>'
    };
    return icons[type] || '<i class="fas fa-info-circle text-primary"></i>';
}

function getNotificationTitle(type) {
    const titles = {
        'booking_request': 'New Booking Request',
        'booking_accepted': 'Booking Accepted',
        'booking_rejected': 'Booking Declined',
        'ride_completed': 'Ride Completed'
    };
    return titles[type] || 'Notification';
}

// Time ago helper
function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

// === NEW: unread count badge auto-refresh ===
async function updateUnreadCountBadge() {
    try {
        const res = await apiRequest('/api/notifications/unread-count');
        const badge = document.getElementById('notificationBadge');
        if (res.count > 0) {
            badge.textContent = res.count > 9 ? '9+' : res.count;
            badge.classList.remove('d-none');
        } else {
            badge.classList.add('d-none');
        }
    } catch (err) {
        console.warn('Unread count check failed:', err.message);
    }
}
setInterval(updateUnreadCountBadge, 15000);

// Close notifications when clicking outside
document.addEventListener('click', function(event) {
    const panel = document.getElementById('notificationPanel');
    const btn = document.getElementById('notificationBtn');
    if (panel && btn && !panel.contains(event.target) && !btn.contains(event.target)) {
        panel.classList.add('d-none');
    }
});

// Utility to show alerts
function showAlert(message, type, containerId = null) {
    if (containerId) {
        const alertElement = document.getElementById(containerId);
        if (alertElement) {
            alertElement.className = `alert alert-${type}`;
            alertElement.textContent = message;
            alertElement.classList.remove('d-none');
            setTimeout(() => alertElement.classList.add('d-none'), 5000);
        }
    } else {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.style.position = 'fixed';
        alertDiv.style.top = '20px';
        alertDiv.style.right = '20px';
        alertDiv.style.zIndex = '9999';
        alertDiv.style.minWidth = '300px';
        alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
        document.body.appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 5000);
    }
}


// -----------------------------

function showVehicleImage(imageUrl) {
  const modalImage = document.getElementById('modalVehicleImage');
  modalImage.src = imageUrl;
  const modal = new bootstrap.Modal(document.getElementById('vehicleImageModal'));
  modal.show();
}

function showRideMap(from, to, rideId) {
  // Create Bootstrap modal dynamically
  const modalHtml = `
    <div class="modal fade" id="rideMapModal-${rideId}" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="fas fa-route me-2"></i>${from} → ${to}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-0">
            <div id="map-${rideId}" style="height: 450px; width: 100%;"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);
  const modal = new bootstrap.Modal(document.getElementById(`rideMapModal-${rideId}`));
  modal.show();

  // When modal opens, initialize the Leaflet map
  document
    .getElementById(`rideMapModal-${rideId}`)
    .addEventListener("shown.bs.modal", async () => {
      const map = L.map(`map-${rideId}`).setView([20.5937, 78.9629], 6);

      // Tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      try {
        async function getBestCoordinates(placeName) {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              placeName
            )}`
          );
          const results = await response.json();
          if (!results || results.length === 0) return null;

          const preferred = results.find((r) =>
            ["city", "town", "village", "suburb", "locality"].includes(r.type)
          );
          const chosen = preferred || results[0];
          return [parseFloat(chosen.lat), parseFloat(chosen.lon)];
        }

        const [fromCoords, toCoords] = await Promise.all([
          getBestCoordinates(from),
          getBestCoordinates(to),
        ]);

        if (!fromCoords || !toCoords) {
          console.error("Invalid coordinates");
          return;
        }

        
 const blueIcon = new L.Icon({
  iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const redIcon = new L.Icon({
  iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.marker(fromCoords, { icon: blueIcon })
  .addTo(map)
  .bindPopup(`<b>Start:</b> ${from}`)
  .openPopup();

L.marker(toCoords, { icon: redIcon })
  .addTo(map)
  .bindPopup(`<b>Destination:</b> ${to}`);

        // ✅ Use Leaflet Routing Machine for real route path
        L.Routing.control({
  waypoints: [
    L.latLng(fromCoords[0], fromCoords[1]),
    L.latLng(toCoords[0], toCoords[1]),
  ],
  router: L.Routing.osrmv1({
    serviceUrl: "https://router.project-osrm.org/route/v1",
    profile: "driving",
    alternatives: true, // Get multiple routes
  }),
  routeWhileDragging: false,
  addWaypoints: false,
  draggableWaypoints: false,
  fitSelectedRoutes: true,
  show: false,
  lineOptions: {
    styles: [{ color: "blue", weight: 4, dashArray: "10, 10" }],
  },
  createMarker: () => null, // prevent LRM from adding default markers
}).on("routesfound", function (e) {
  // ✅ Select the shortest route automatically
  const routes = e.routes;
  if (routes && routes.length > 1) {
    const shortest = routes.reduce((a, b) =>
      a.summary.totalDistance < b.summary.totalDistance ? a : b
    );
    e.target.setWaypoints(shortest.inputWaypoints);
  }
}).addTo(map);
      } catch (err) {
        console.error("Map plotting error:", err);
      }
    });

  // Clean up modal when closed
  document
    .getElementById(`rideMapModal-${rideId}`)
    .addEventListener("hidden.bs.modal", function () {
      this.remove();
    });
}