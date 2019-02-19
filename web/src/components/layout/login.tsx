import * as React from 'react';
import { Button, Form } from 'react-bootstrap';
import { LinkButton } from '../ui/ui';
import { Localized } from 'fluent-react/compat';

interface LoginProps {
  user: {
    userId: string;
  };
}

export default class Login extends React.Component<LoginProps, any> {
  constructor(props: LoginProps) {
    super(props);

    this.state = {
      email: '',
      password: '',
      showLoginPopup: false,
      showRegisterPopup: false,
    };
  }

  getFormUrl = (): string => {
    return this.state.showLoginPopup ? '/login' : '/register';
  };

  validateForm = (): boolean => {
    return this.state.email.length > 0 && this.state.password.length > 0;
  };

  handleChange = (event: any) => {
    this.setState({
      [event.target.id]: event.target.value,
    });
  };

  handleSubmit = (event: any) => {
    event.preventDefault();

    fetch(this.getFormUrl(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: this.state.email,
        password: this.state.password,
        client_id: this.props.user.userId,
      }),
    }).then(value => {});
  };

  render() {
    const { email, password, showLoginPopup, showRegisterPopup } = this.state;

    return (
      <div>
        <Localized id="login-signup">
          <LinkButton
            onClick={() => this.setState({ showLoginPopup: true })}
            rounded
          />
        </Localized>
        {(showLoginPopup || showRegisterPopup) && (
          <div className="login-popup">
            <button
              className="popup-close"
              onClick={() =>
                this.setState({
                  showLoginPopup: false,
                  showRegisterPopup: false,
                })
              }>
              Close
            </button>
            {showLoginPopup && (
              <button
                className="popup-close"
                onClick={() =>
                  this.setState({
                    showLoginPopup: false,
                    showRegisterPopup: true,
                  })
                }>
                Register
              </button>
            )}
            {showRegisterPopup && (
              <button
                className="popup-close"
                onClick={() =>
                  this.setState({
                    showLoginPopup: true,
                    showRegisterPopup: false,
                  })
                }>
                Login
              </button>
            )}
            <h1> Account {showRegisterPopup ? 'registration' : 'login'}</h1>
            <form
              action={this.getFormUrl()}
              method={'post'}
              onSubmit={this.handleSubmit}>
              <Form.Group controlId="email">
                <Form.Label>Email</Form.Label>
                <Form.Control
                  autoFocus
                  value={email}
                  type="email"
                  onChange={this.handleChange}
                />
              </Form.Group>
              <Form.Group controlId="password">
                <Form.Label>Password</Form.Label>
                <Form.Control
                  value={password}
                  type="password"
                  onChange={this.handleChange}
                />
              </Form.Group>
              <Button block disabled={!this.validateForm()} type="submit">
                {showRegisterPopup ? 'register' : 'login'}
              </Button>
            </form>
          </div>
        )}
      </div>
    );
  }
}
